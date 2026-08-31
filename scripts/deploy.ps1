$ErrorActionPreference = "Stop"

$ProjectRegion = if ($env:AWS_REGION) { $env:AWS_REGION } else { "us-east-1" }
$StackName = if ($env:STACK_NAME) { $env:STACK_NAME } else { "clouddesk-aws" }
$NotificationEmail = if ($env:NOTIFICATION_EMAIL) { $env:NOTIFICATION_EMAIL } else { "" }
$BudgetEmail = if ($env:BUDGET_EMAIL) { $env:BUDGET_EMAIL } else { "" }
$MonthlyBudgetUsd = if ($env:MONTHLY_BUDGET_USD) { $env:MONTHLY_BUDGET_USD } else { "5" }
$RootDir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

if (-not (Get-Command aws -ErrorAction SilentlyContinue)) { throw "Falta AWS CLI." }
if (-not (Get-Command sam -ErrorAction SilentlyContinue)) { throw "Falta AWS SAM CLI." }

aws sts get-caller-identity | Out-Null
Push-Location "$RootDir\infrastructure"
try {
  sam build
  if ($LASTEXITCODE -ne 0) { throw "FallÃ³ sam build." }

  sam deploy `
    --stack-name $StackName `
    --region $ProjectRegion `
    --resolve-s3 `
    --capabilities CAPABILITY_IAM `
    --no-confirm-changeset `
    --no-fail-on-empty-changeset `
    --parameter-overrides `
      ProjectName=clouddesk `
      NotificationEmail=$NotificationEmail `
      BudgetEmail=$BudgetEmail `
      MonthlyBudgetUsd=$MonthlyBudgetUsd
  if ($LASTEXITCODE -ne 0) { throw "FallÃ³ sam deploy." }
} finally {
  Pop-Location
}

function Get-StackOutput([string]$Key) {
  return aws cloudformation describe-stacks `
    --stack-name $StackName `
    --region $ProjectRegion `
    --query "Stacks[0].Outputs[?OutputKey=='$Key'].OutputValue" `
    --output text
}

$ApiUrl = Get-StackOutput "ApiUrl"
$ClientId = Get-StackOutput "UserPoolClientId"
$CognitoDomain = Get-StackOutput "CognitoDomain"
$FrontendUrl = Get-StackOutput "FrontendUrl"
$Bucket = Get-StackOutput "FrontendBucketName"
$DistributionId = Get-StackOutput "FrontendDistributionId"

$Config = Get-Content "$RootDir\frontend\config.template.js" -Raw
$Config = $Config.Replace("__REGION__", $ProjectRegion)
$Config = $Config.Replace("__API_URL__", $ApiUrl)
$Config = $Config.Replace("__COGNITO_DOMAIN__", $CognitoDomain)
$Config = $Config.Replace("__CLIENT_ID__", $ClientId)
$Config = $Config.Replace("__REDIRECT_URI__", $FrontendUrl)
Set-Content "$RootDir\frontend\config.js" $Config -Encoding utf8

aws s3 sync "$RootDir\frontend" "s3://$Bucket" `
  --region $ProjectRegion `
  --delete `
  --exclude "config.template.js" `
  --exclude "config.example.js"
if ($LASTEXITCODE -ne 0) { throw "FallÃ³ la publicaciÃ³n en S3." }

aws cloudfront create-invalidation --distribution-id $DistributionId --paths "/*" | Out-Null
Write-Host "CloudDesk publicado en: $FrontendUrl"
Write-Host "Si configuraste SNS, confirma la suscripciÃ³n recibida por correo."
