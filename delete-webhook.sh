#!/bin/bash

# Load environment variables
source .env

# Check if webhook ID is provided
if [ -z "$1" ]; then
  echo "Please provide a webhook ID"
  echo "Usage: ./delete-webhook.sh <webhook_id>"
  exit 1
fi

WEBHOOK_ID=$1

# Delete the webhook subscription
curl --request DELETE \
  --url "https://api.calendly.com/webhook_subscriptions/${WEBHOOK_ID}" \
  --header "Authorization: Bearer ${CALENDLY_TOKEN}" 