#!/bin/bash
# Attach S3 session storage policy to the deployed AgentCore runtime.
# Run once after the first deploy.
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
STATE_FILE="$SCRIPT_DIR/agentcore/.cli/deployed-state.json"
BUCKET="{{S3_SESSION_BUCKET}}"

if [ ! -f "$STATE_FILE" ]; then
    echo "Error: $STATE_FILE not found — run 'agentcore deploy' first."
    exit 1
fi

RUNTIME_NAME=$(jq -r '.targets.default.resources.runtimes | keys[0]' "$STATE_FILE")
ROLE_ARN=$(jq -r ".targets.default.resources.runtimes[\"$RUNTIME_NAME\"].roleArn" "$STATE_FILE")

if [ -z "$ROLE_ARN" ] || [ "$ROLE_ARN" = "null" ]; then
    echo "Error: Could not find roleArn in deployed-state.json"
    exit 1
fi

ROLE_NAME=$(echo "$ROLE_ARN" | awk -F/ '{print $NF}')
echo "Role: $ROLE_NAME"
echo "Bucket: $BUCKET"

aws iam put-role-policy \
  --role-name "$ROLE_NAME" \
  --policy-name S3SessionStorage \
  --policy-document "{
    \"Version\": \"2012-10-17\",
    \"Statement\": [{
      \"Effect\": \"Allow\",
      \"Action\": [\"s3:PutObject\", \"s3:GetObject\", \"s3:ListBucket\"],
      \"Resource\": [
        \"arn:aws:s3:::${BUCKET}\",
        \"arn:aws:s3:::${BUCKET}/*\"
      ]
    }]
  }"

echo "Done — S3 session policy attached."
