#!/bin/bash

# Test script for Slack webhook integration
# Usage: ./test-slack-webhook.sh [local|tunnel] [uuid]

set -e

# Get the target type (local or tunnel)
TARGET=${1:-local}
# Get optional UUID (for n8n format)
UUID=${2:-"09210404-b3f7-48c7-9cd2-07f922bc4b14"}

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
# Direct webhook URL
DIRECT_URL="${BASE_URL}/webhook/slack"

# Create sample Slack message event payload
cat > /tmp/slack-message-payload.json << EOL
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

# Show options
echo ""
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

echo "Testing Slack webhook with URL: ${TEST_URL}"
echo "Sending test payload..."

# Send request with curl
curl -X POST \
  -H "Content-Type: application/json" \
  -d @/tmp/slack-message-payload.json \
  -s "${TEST_URL}" | jq .

echo ""
echo "Webhook test completed" 