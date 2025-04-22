#!/bin/bash

# Load environment variables
source .env

# Get the IAM user ARN
USER_ARN=$(aws sts get-caller-identity --query "Arn" --output text)

# Create the policy document
POLICY=$(cat <<EOF
{
  "Version": "2012-10-17",
  "Id": "__default_policy_ID",
  "Statement": [
    {
      "Sid": "__owner_statement",
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::619326977873:root"
      },
      "Action": "SQS:*",
      "Resource": "arn:aws:sqs:us-west-1:619326977873:calendly-webhooks.fifo"
    },
    {
      "Sid": "__sender_statement",
      "Effect": "Allow",
      "Principal": {
        "AWS": "${USER_ARN}"
      },
      "Action": "SQS:SendMessage",
      "Resource": "arn:aws:sqs:us-west-1:619326977873:calendly-webhooks.fifo",
      "Condition": {
        "StringEquals": {
          "aws:SourceAccount": "619326977873"
        }
      }
    }
  ]
}
EOF
)

# Escape and format the policy for AWS CLI
ESCAPED_POLICY=$(echo "$POLICY" | jq -c . | sed 's/"/\\"/g')

echo "Current user ARN: ${USER_ARN}"
echo -e "\nApplying policy..."

# Update the queue policy
aws sqs set-queue-attributes \
  --queue-url "${SQS_QUEUE_URL}" \
  --attributes "{\"Policy\":\"${ESCAPED_POLICY}\"}" \
  --region "${AWS_REGION}"

# Verify the updated policy
echo -e "\nVerifying updated policy..."
aws sqs get-queue-attributes \
  --queue-url "${SQS_QUEUE_URL}" \
  --attribute-names Policy \
  --region "${AWS_REGION}" 