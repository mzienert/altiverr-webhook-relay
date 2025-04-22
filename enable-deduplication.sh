#!/bin/bash

# Load environment variables
source .env

echo "Enabling content-based deduplication on queue..."
aws sqs set-queue-attributes \
  --queue-url "${SQS_QUEUE_URL}" \
  --attributes "{\"ContentBasedDeduplication\":\"true\"}" \
  --region "${AWS_REGION}"

echo -e "\nVerifying queue attributes..."
aws sqs get-queue-attributes \
  --queue-url "${SQS_QUEUE_URL}" \
  --attribute-names All \
  --region "${AWS_REGION}" 