#!/usr/bin/env bash
set -euo pipefail

PROJECT_REGION="${AWS_REGION:-us-east-1}"
STACK_NAME="${STACK_NAME:-clouddesk-aws}"

echo "CloudDesk conserva la tabla DynamoDB y el bucket S3 para proteger los datos."
echo "Vacía y elimina esos recursos manualmente solo si realmente deseas borrar todo."
sam delete --stack-name "$STACK_NAME" --region "$PROJECT_REGION"
