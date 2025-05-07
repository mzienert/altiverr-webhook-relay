#!/bin/bash

# Load environment variables
source .env

# Default webhook ID if not provided
WEBHOOK_ID=${1:-"f939a053-cc02-4c1e-9334-b83686933ff1"}

# Get the latest deployment URL
LATEST_URL=$(vercel ls --production -j | jq -r '.deployments[0].url')

if [[ -z "$LATEST_URL" || "$LATEST_URL" == "null" ]]; then
  echo "Could not fetch the latest deployment URL. Falling back to vercel.app URL."
  LATEST_URL="altiverr-webhook-relay.vercel.app"
fi

# Ensure the URL has https:// prefix
if [[ ! "$LATEST_URL" =~ ^https?:// ]]; then
  LATEST_URL="https://$LATEST_URL"
fi

# Construct the webhook URL
WEBHOOK_URL="$LATEST_URL/api/slack-webhook/$WEBHOOK_ID"

echo "Testing Slack webhook relay..."
echo "Target URL: $WEBHOOK_URL"

# Check if this is a challenge test
if [ "$2" == "challenge" ]; then
  # Challenge verification payload
  read -r -d '' PAYLOAD << EOM
{
  "token": "test-token",
  "challenge": "challenge-value-1234567890",
  "type": "url_verification"
}
EOM
  echo "Testing URL verification challenge..."
else
  # Regular event payload
  read -r -d '' PAYLOAD << EOM
{
  "token": "test-token",
  "team_id": "T0001",
  "api_app_id": "A0001",
  "event": {
    "type": "message",
    "channel": "C2147483705",
    "user": "U2147483697",
    "text": "This is a test message from the webhook relay",
    "ts": "1355517523.000005"
  },
  "type": "event_callback",
  "event_id": "Ev0123456789",
  "event_time": 1355517523
}
EOM
  echo "Testing regular event payload..."
fi

# Send the test request
echo "Sending test webhook request..."
curl -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" \
  -v

echo
echo "Test completed!" 