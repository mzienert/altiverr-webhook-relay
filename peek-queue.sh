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

# Process command-line arguments
MAX_MESSAGES=10
STATS_MODE=true
ATTRIBUTES_MODE=false
WAIT_TIME=0

while [[ $# -gt 0 ]]; do
  case $1 in
    --max=*)
      MAX_MESSAGES="${1#*=}"
      shift
      ;;
    --no-stats)
      STATS_MODE=false
      shift
      ;;
    --attributes)
      ATTRIBUTES_MODE=true
      shift
      ;;
    --wait=*)
      WAIT_TIME="${1#*=}"
      shift
      ;;
    *)
      echo "Unknown option: $1"
      echo "Usage: ./peek-queue.sh [--max=10] [--no-stats] [--attributes] [--wait=0]"
      exit 1
      ;;
  esac
done

# Make sure the API key is defined
if [ -z "$QUEUE_API_KEY" ]; then
  echo "Error: QUEUE_API_KEY environment variable is not set"
  echo "Please set it in your .env file or export it in your shell"
  exit 1
fi

# Construct query parameters - use visibility timeout of 0 to peek without locking messages
QUERY_PARAMS="max=${MAX_MESSAGES}&wait=${WAIT_TIME}&visibility=0"
if [ "$STATS_MODE" = true ]; then
  QUERY_PARAMS="${QUERY_PARAMS}&stats=true"
fi
if [ "$ATTRIBUTES_MODE" = true ]; then
  QUERY_PARAMS="${QUERY_PARAMS}&attributes=true"
fi

# Retrieve messages from the queue
echo "Peeking at up to ${MAX_MESSAGES} messages from the queue (visibility timeout: 0s)..."
QUEUE_RESPONSE=$(curl -s "${BASE_URL}/queue?${QUERY_PARAMS}" \
  -H "x-api-key: ${QUEUE_API_KEY}")

# Check if there's an error in the response
if echo "$QUEUE_RESPONSE" | grep -q "error"; then
  echo "Error response from API:"
  echo "$QUEUE_RESPONSE" | jq .
  exit 1
fi

# Parse message count - safely handle potential parsing issues
MESSAGE_COUNT=$(echo "$QUEUE_RESPONSE" | jq -r '.count')

# Check if count is valid
if [[ ! "$MESSAGE_COUNT" =~ ^[0-9]+$ ]]; then
  echo "Invalid message count returned. Raw response:"
  echo "$QUEUE_RESPONSE"
  exit 1
fi

if [ "$MESSAGE_COUNT" -eq 0 ]; then
  echo "No messages found in the queue."
  
  # Show queue stats even if no messages found
  if [ "$STATS_MODE" = true ]; then
    echo -e "\nQueue Statistics:"
    if echo "$QUEUE_RESPONSE" | jq -r '.stats' | grep -q "null"; then
      echo "  No queue statistics available"
    else
      echo "$QUEUE_RESPONSE" | jq -r '.stats | to_entries[] | "  \(.key): \(.value)"'
    fi
  fi
  
  exit 0
fi

echo "Found ${MESSAGE_COUNT} messages:"

# Process messages
for i in $(seq 0 $((MESSAGE_COUNT-1))); do
  # Extract message details
  MESSAGE_ID=$(echo "$QUEUE_RESPONSE" | jq -r ".messages[$i].id")
  # Pretty print the body for better readability
  MESSAGE_BODY=$(echo "$QUEUE_RESPONSE" | jq -r ".messages[$i].body" | jq -r '.')
  
  # Display message details
  echo -e "\nMessage #$((i+1)):"
  echo "  ID: $MESSAGE_ID"
  echo "  Body:"
  echo "$MESSAGE_BODY" | jq -r '.' | sed 's/^/    /'
done

# Show queue stats if requested
if [ "$STATS_MODE" = true ]; then
  echo -e "\nQueue Statistics:"
  if echo "$QUEUE_RESPONSE" | jq -r '.stats' | grep -q "null"; then
    echo "  No queue statistics available"
  else
    echo "$QUEUE_RESPONSE" | jq -r '.stats | to_entries[] | "  \(.key): \(.value)"'
  fi
fi

echo -e "\nNote: Messages were peeked at with a visibility timeout of 0s, so they remain available for processing." 