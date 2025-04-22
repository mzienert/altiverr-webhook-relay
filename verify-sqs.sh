#!/bin/bash

# Load environment variables
source .env

echo "Testing SQS Queue Configuration..."
echo "================================"
echo "Queue URL: ${SQS_QUEUE_URL}"
echo "Region: ${AWS_REGION}"
echo

echo "1. Testing queue attributes..."
aws sqs get-queue-attributes \
  --queue-url "${SQS_QUEUE_URL}" \
  --attribute-names All \
  --region "${AWS_REGION}"

echo
echo "2. Testing send message permission..."
aws sqs send-message \
  --queue-url "${SQS_QUEUE_URL}" \
  --message-body "test message" \
  --message-group-id "test-group" \
  --message-deduplication-id "$(date +%s)" \
  --region "${AWS_REGION}"

echo
echo "3. Testing queue policy..."
aws sqs get-queue-attributes \
  --queue-url "${SQS_QUEUE_URL}" \
  --attribute-names Policy \
  --region "${AWS_REGION}" 