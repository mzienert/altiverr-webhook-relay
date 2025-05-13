#!/bin/bash

# Test script for Slack webhook integration with Vercel deployment
# Usage: ./test-slack-vercel.sh [uuid]

set -e

# Get the Vercel deployment URL
VERCEL_URL=${VERCEL_URL:-"altiverr-webhook-relay.vercel.app"}
# Get optional UUID (for n8n format)
UUID=${1:-"09210404-b3f7-48c7-9cd2-07f922bc4b14"}

# Construct the full Vercel URL
FULL_URL="https://${VERCEL_URL}/webhook/${UUID}/webhook"

echo "Using Vercel URL: ${FULL_URL}"

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
    "text": "This is a test message from webhook relay to Vercel",
    "ts": "1626793500.000700",
    "channel_type": "channel"
  },
  "type": "event_callback",
  "event_id": "Ev123ABC456",
  "event_time": 1626793500
}
EOL

echo "Testing Slack webhook with Vercel deployment..."
echo "This will send a test webhook to your Vercel deployment, which will:"
echo "1. Process the webhook"
echo "2. Publish to SNS"
echo "3. Your local proxy should receive the message (check proxy logs)"
echo ""
echo "Testing webhook URL: ${FULL_URL}"
echo "Sending test payload..."

# Send request with curl
curl -X POST \
  -H "Content-Type: application/json" \
  -d @/tmp/slack-message-payload.json \
  -s "${FULL_URL}" | jq .

echo ""
echo "Webhook test completed - check your local proxy logs to verify the flow:"
echo "tail -f logs/proxy.log"
echo "" 