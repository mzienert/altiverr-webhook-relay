#!/bin/bash

# Load environment variables
source .env

# Get all webhook subscriptions for the organization
curl --request GET \
  --url "https://api.calendly.com/webhook_subscriptions?organization=https://api.calendly.com/organizations/${CALENDLY_ORG_ID}&scope=organization" \
  --header "Authorization: Bearer ${CALENDLY_TOKEN}" \
  --header "Content-Type: application/json" 