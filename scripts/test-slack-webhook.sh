#!/bin/bash

# Test script for webhook integrations
# Usage: ./test-slack-webhook.sh [local|tunnel] [slack|calendly] [uuid]

set -e

# Get the target type (local or tunnel)
TARGET=${1:-local}
# Get webhook type (slack or calendly)
WEBHOOK_TYPE=${2:-slack}
# Get optional UUID (for n8n format)
UUID=${3:-"09210404-b3f7-48c7-9cd2-07f922bc4b14"}

# Base URL based on target
if [ "$TARGET" = "tunnel" ]; then
  # If using tunnel, get tunnel hostname from env file
  TUNNEL_HOST=$(grep TUNNEL_HOST ../.env | cut -d '=' -f2)
  if [ -z "$TUNNEL_HOST" ]; then
    echo "Error: TUNNEL_HOST not found in .env file"
    exit 1
  fi
  BASE_URL="https://${TUNNEL_HOST}"
  echo "Using tunnel URL: $BASE_URL"
else
  # Default to localhost
  PORT=${PORT:-3333}
  BASE_URL="http://localhost:${PORT}"
  echo "Using local URL: $BASE_URL"
fi

# Test both n8n URL formats, exactly matching what n8n provides
N8N_DEV_URL="${BASE_URL}/webhook-test/${UUID}/webhook"
N8N_PROD_URL="${BASE_URL}/webhook/${UUID}/webhook"
# Direct webhook URL based on type
if [ "$WEBHOOK_TYPE" = "calendly" ]; then
  DIRECT_URL="${BASE_URL}/webhook/calendly"
else
  DIRECT_URL="${BASE_URL}/webhook/slack"
fi

# Create sample payloads based on type
if [ "$WEBHOOK_TYPE" = "calendly" ]; then
  echo "Creating Calendly test payload..."
  cat > /tmp/webhook-payload.json << EOL
{
  "event": "invitee.created",
  "time": "2025-05-13T04:30:00Z",
  "payload": {
    "event_type": {
      "uri": "https://api.calendly.com/event_types/ABCDEF123456",
      "name": "Test Meeting"
    },
    "event": {
      "uri": "https://api.calendly.com/scheduled_events/ABCDEF123456",
      "name": "Test Meeting"
    },
    "invitee": {
      "uuid": "INVITEE123456",
      "email": "test@example.com",
      "name": "Test User"
    }
  }
}
EOL
  # Add extra headers for Calendly
  EXTRA_HEADERS=(-H "user-agent: Calendly")

else
  echo "Creating Slack test payload..."
  cat > /tmp/webhook-payload.json << EOL
{
  "token": "verification_token",
  "team_id": "T123ABC456",
  "api_app_id": "A123ABC456",
  "event": {
    "type": "message",
    "channel": "C123ABC456",
    "user": "U123ABC456",
    "text": "This is a test message from webhook relay",
    "ts": "1626793500.000700",
    "channel_type": "channel"
  },
  "type": "event_callback",
  "event_id": "Ev123ABC456",
  "event_time": 1626793500
}
EOL
  # Add extra headers for Slack
  EXTRA_HEADERS=(-H "user-agent: Slackbot 1.0 (+https://api.slack.com/robots)")
fi

# Show options
echo ""
echo "Testing ${WEBHOOK_TYPE} webhook integration"
echo "Select URL to test:"
echo "1) n8n Dev URL: ${N8N_DEV_URL}"
echo "2) n8n Prod URL: ${N8N_PROD_URL}"
echo "3) Direct Webhook URL: ${DIRECT_URL}"
read -p "Enter option (1, 2, or 3): " OPTION

if [ "$OPTION" = "1" ]; then
  TEST_URL=$N8N_DEV_URL
elif [ "$OPTION" = "2" ]; then
  TEST_URL=$N8N_PROD_URL
else
  TEST_URL=$DIRECT_URL
fi

echo "Testing ${WEBHOOK_TYPE} webhook with URL: ${TEST_URL}"
echo "Sending test payload..."

# Send request with curl
curl -X POST \
  -H "Content-Type: application/json" \
  "${EXTRA_HEADERS[@]}" \
  -d @/tmp/webhook-payload.json \
  -s "${TEST_URL}" | jq .

echo ""
echo "Webhook test completed" 