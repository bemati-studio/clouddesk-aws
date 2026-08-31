#!/usr/bin/env bash
set -euo pipefail

PROJECT_REGION="${AWS_REGION:-us-east-1}"
STACK_NAME="${STACK_NAME:-clouddesk-aws}"
NOTIFICATION_EMAIL="${NOTIFICATION_EMAIL:-}"
BUDGET_EMAIL="${BUDGET_EMAIL:-}"
MONTHLY_BUDGET_USD="${MONTHLY_BUDGET_USD:-5}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

command -v aws >/dev/null || { echo "Falta AWS CLI."; exit 1; }
command -v sam >/dev/null || { echo "Falta AWS SAM CLI."; exit 1; }
aws sts get-caller-identity >/dev/null

cd "$ROOT_DIR/infrastructure"
sam build
sam deploy \
  --stack-name "$STACK_NAME" \
  --region "$PROJECT_REGION" \
  --resolve-s3 \
  --capabilities CAPABILITY_IAM \
  --no-confirm-changeset \
  --no-fail-on-empty-changeset \
  --parameter-overrides \
    ProjectName=clouddesk \
    NotificationEmail="$NOTIFICATION_EMAIL" \
    BudgetEmail="$BUDGET_EMAIL" \
    MonthlyBudgetUsd="$MONTHLY_BUDGET_USD"

output() {
  aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --region "$PROJECT_REGION" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" \
    --output text
}

API_URL="$(output ApiUrl)"
CLIENT_ID="$(output UserPoolClientId)"
COGNITO_DOMAIN="$(output CognitoDomain)"
FRONTEND_URL="$(output FrontendUrl)"
BUCKET="$(output FrontendBucketName)"
DISTRIBUTION_ID="$(output FrontendDistributionId)"

sed \
  -e "s|__REGION__|$PROJECT_REGION|g" \
  -e "s|__API_URL__|$API_URL|g" \
  -e "s|__COGNITO_DOMAIN__|$COGNITO_DOMAIN|g" \
  -e "s|__CLIENT_ID__|$CLIENT_ID|g" \
  -e "s|__REDIRECT_URI__|$FRONTEND_URL|g" \
  "$ROOT_DIR/frontend/config.template.js" > "$ROOT_DIR/frontend/config.js"

aws s3 sync "$ROOT_DIR/frontend" "s3://$BUCKET" \
  --region "$PROJECT_REGION" \
  --delete \
  --exclude "config.template.js" \
  --exclude "config.example.js"

aws cloudfront create-invalidation \
  --distribution-id "$DISTRIBUTION_ID" \
  --paths "/*" >/dev/null

echo "CloudDesk publicado en: $FRONTEND_URL"
echo "Si configuraste SNS, confirma la suscripción recibida por correo."

