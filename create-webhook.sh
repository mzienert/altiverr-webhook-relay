#!/bin/bash

# Load environment variables
source .env

curl --request POST \
  --url https://api.calendly.com/webhook_subscriptions \
  --header "Content-Type: application/json" \
  --header "Authorization: Bearer ${CALENDLY_TOKEN}" \
  --data "{
    \"url\": \"${CALENDLY_WEBHOOK_URL}\",
    \"events\": [\"invitee.created\", \"invitee.canceled\"],
    \"organization\": \"https://api.calendly.com/organizations/${CALENDLY_ORG_ID}\",
    \"scope\": \"organization\"
  }" 