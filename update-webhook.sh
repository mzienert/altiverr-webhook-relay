#!/bin/bash

# Load environment variables
source .env

# Check if webhook ID is provided
if [ -z "$1" ]; then
  echo "Please provide a webhook ID"
  echo "Usage: ./update-webhook.sh <webhook_id> [--url <new_url>] [--events <event1,event2>]"
  exit 1
fi

WEBHOOK_ID=$1
shift

# Initialize variables
NEW_URL=${CALENDLY_WEBHOOK_URL}
EVENTS="[\"invitee.created\",\"invitee.canceled\"]"

# Parse optional arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --url)
      NEW_URL="$2"
      shift 2
      ;;
    --events)
      # Convert comma-separated list to JSON array
      IFS=',' read -ra EVENT_ARRAY <<< "$2"
      EVENTS="["
      for i in "${EVENT_ARRAY[@]}"; do
        EVENTS="$EVENTS\"$i\","
      done
      EVENTS="${EVENTS%,}]"
      shift 2
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# Update the webhook subscription
curl --request PATCH \
  --url "https://api.calendly.com/webhook_subscriptions/${WEBHOOK_ID}" \
  --header "Content-Type: application/json" \
  --header "Authorization: Bearer ${CALENDLY_TOKEN}" \
  --data "{
    \"url\": \"${NEW_URL}\",
    \"events\": ${EVENTS}
  }" 