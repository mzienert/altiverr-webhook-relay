#!/bin/bash

# Load environment variables
source .env

# Get the latest deployment URL from Vercel
echo "Fetching the latest deployment URL from Vercel..."

# Extract project and org IDs from .vercel/project.json
PROJECT_ID=$(grep -o '"projectId":"[^"]*' .vercel/project.json | cut -d '"' -f 4)
ORG_ID=$(grep -o '"orgId":"[^"]*' .vercel/project.json | cut -d '"' -f 4)

# Use Vercel API to get the latest deployment
VERCEL_DEPLOYMENTS=$(curl -s "https://api.vercel.com/v6/deployments?projectId=${PROJECT_ID}&teamId=${ORG_ID}&target=production&limit=1" \
  -H "Authorization: Bearer ${VERCEL_TOKEN}")

# Extract the latest production deployment URL
LATEST_URL=$(echo "$VERCEL_DEPLOYMENTS" | grep -o '"url":"[^"]*' | head -1 | cut -d '"' -f 4)

if [ -z "$LATEST_URL" ]; then
  echo "Could not fetch the latest deployment URL. Falling back to .env URL."
  BASE_URL=$(echo "${CALENDLY_WEBHOOK_URL}" | sed 's/\/webhook$//')
else
  # Construct the full API base URL
  BASE_URL="https://${LATEST_URL}/api"
  echo "Using latest deployment API base URL: $BASE_URL"
fi

# Make sure the API key is defined
if [ -z "$QUEUE_API_KEY" ]; then
  echo "Error: QUEUE_API_KEY environment variable is not set"
  echo "Please set it in your .env file or export it in your shell"
  exit 1
fi

# Use the AWS CLI directly to get the complete queue stats
echo -e "\nFetching detailed queue attributes from AWS SQS..."
aws sqs get-queue-attributes \
  --queue-url "${SQS_QUEUE_URL}" \
  --attribute-names All \
  --region "${AWS_REGION}"

# Also fetch stats from our API endpoint for comparison
echo -e "\nFetching basic queue statistics from API endpoint..."
QUEUE_RESPONSE=$(curl -s "${BASE_URL}/queue?max=1&stats=true&visibility=0" \
  -H "x-api-key: ${QUEUE_API_KEY}")

# Check if there's an error in the response
if echo "$QUEUE_RESPONSE" | grep -q "error"; then
  echo "Error response from API:"
  echo "$QUEUE_RESPONSE" | jq .
  exit 1
fi

# Display the stats
echo -e "\nQueue Statistics from API:"
if echo "$QUEUE_RESPONSE" | jq -r '.stats' | grep -q "null"; then
  echo "  No queue statistics available from API endpoint"
else
  echo "$QUEUE_RESPONSE" | jq -r '.stats | to_entries[] | "  \(.key): \(.value)"'
fi

echo -e "\nQueue Information:"
echo "  Messages available (approx): $(echo "$QUEUE_RESPONSE" | jq -r '.count // "0"')"
echo "  API Endpoint: ${BASE_URL}/queue"
echo "  SQS Queue URL: ${SQS_QUEUE_URL}" 