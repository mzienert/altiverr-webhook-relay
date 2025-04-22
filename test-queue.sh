#!/bin/bash

# Load environment variables
source .env

# Use the direct API base URL
BASE_URL="https://altiverr-webhook-relay.vercel.app/api"
echo "Using API base URL: $BASE_URL"

# Process command-line arguments
MAX_MESSAGES=10
DELETE_MODE=false
STATS_MODE=false
ATTRIBUTES_MODE=false
WAIT_TIME=0
VISIBILITY_TIMEOUT=300 # Set a much longer visibility timeout (5 minutes)

while [[ $# -gt 0 ]]; do
  case $1 in
    --max=*)
      MAX_MESSAGES="${1#*=}"
      shift
      ;;
    --delete)
      DELETE_MODE=true
      shift
      ;;
    --stats)
      STATS_MODE=true
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
    --visibility=*)
      VISIBILITY_TIMEOUT="${1#*=}"
      shift
      ;;
    *)
      echo "Unknown option: $1"
      echo "Usage: ./test-queue.sh [--max=10] [--delete] [--stats] [--attributes] [--wait=0] [--visibility=300]"
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

# Construct query parameters
QUERY_PARAMS="max=${MAX_MESSAGES}&wait=${WAIT_TIME}&visibility=${VISIBILITY_TIMEOUT}"
if [ "$STATS_MODE" = true ]; then
  QUERY_PARAMS="${QUERY_PARAMS}&stats=true"
fi
if [ "$ATTRIBUTES_MODE" = true ]; then
  QUERY_PARAMS="${QUERY_PARAMS}&attributes=true"
fi

# Retrieve messages from the queue
echo "Retrieving up to ${MAX_MESSAGES} messages from the queue (visibility timeout: ${VISIBILITY_TIMEOUT}s)..."
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
  exit 0
fi

echo "Found ${MESSAGE_COUNT} messages:"

# Process messages
for i in $(seq 0 $((MESSAGE_COUNT-1))); do
  # Extract message details
  MESSAGE_ID=$(echo "$QUEUE_RESPONSE" | jq -r ".messages[$i].id")
  RECEIPT_HANDLE=$(echo "$QUEUE_RESPONSE" | jq -r ".messages[$i].receiptHandle")
  # Pretty print the body for better readability
  MESSAGE_BODY=$(echo "$QUEUE_RESPONSE" | jq -r ".messages[$i].body" | jq -r '.')
  
  # Display message details
  echo -e "\nMessage #$((i+1)):"
  echo "  ID: $MESSAGE_ID"
  echo "  Receipt Handle: ${RECEIPT_HANDLE:0:20}..."
  echo "  Body:"
  echo "$MESSAGE_BODY" | jq -r '.' | sed 's/^/    /'
  
  # Delete the message if delete mode is enabled
  if [ "$DELETE_MODE" = true ]; then
    echo "  Deleting message..."
    DELETE_RESPONSE=$(curl -s -X POST "${BASE_URL}/delete-message" \
      -H "Content-Type: application/json" \
      -H "x-api-key: ${QUEUE_API_KEY}" \
      -d "{\"receiptHandle\":\"$RECEIPT_HANDLE\"}")
      
    # Check if delete was successful
    if echo "$DELETE_RESPONSE" | grep -q "success"; then
      echo "  ✅ Message deleted successfully"
    else
      echo "  ❌ Failed to delete message: $(echo "$DELETE_RESPONSE" | jq -r '.error // "Unknown error"')"
    fi
  fi
done

if [ "$DELETE_MODE" = false ]; then
  echo -e "\nTo delete these messages, run with --delete flag"
fi

# Show queue stats if requested
if [ "$STATS_MODE" = true ]; then
  echo -e "\nQueue Statistics:"
  echo "$QUEUE_RESPONSE" | jq -r '.stats | to_entries[] | "  \(.key): \(.value)"'
fi 