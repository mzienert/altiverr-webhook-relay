#!/bin/bash

# Load environment variables
source .env

# Set the webhook URL to the raw endpoint
WEBHOOK_URL="${CALENDLY_WEBHOOK_URL/\/webhook/\/webhook-raw}"

# Generate a test timestamp and signature
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
PAYLOAD="{
  \"event\": \"invitee.created\",
  \"time\": \"${TIMESTAMP}\",
  \"payload\": {
    \"event_type\": \"TEST\",
    \"event\": {
      \"uuid\": \"test-event-$(date +%s)\",
      \"name\": \"Test Event\"
    },
    \"invitee\": {
      \"uuid\": \"test-invitee-$(date +%s)\",
      \"email\": \"test@example.com\",
      \"name\": \"Test User\"
    }
  }
}"

# Create the signature (same method as in our webhook handler)
SIGNATURE_PAYLOAD="${TIMESTAMP}.${PAYLOAD}"
SIGNATURE=$(echo -n "${SIGNATURE_PAYLOAD}" | openssl dgst -sha256 -hmac "${CALENDLY_WEBHOOK_SIGNING_KEY}" | cut -d' ' -f2)

echo "Testing raw webhook endpoint: ${WEBHOOK_URL}"
echo "Payload:"
echo "${PAYLOAD}" | jq '.'
echo -e "\nSending request..."

# Send the test webhook with verbose output
curl --request POST \
  --url "${WEBHOOK_URL}" \
  --header "Content-Type: application/json" \
  --header "x-calendly-signature: ${SIGNATURE}" \
  --header "x-calendly-timestamp: ${TIMESTAMP}" \
  --data "${PAYLOAD}" \
  -v \
  --write-out '\nStatus code: %{http_code}\n' 