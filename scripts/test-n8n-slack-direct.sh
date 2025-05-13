#!/bin/bash

# Colors for terminal output
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Set webhook ID
WEBHOOK_ID="09210404-b3f7-48c7-9cd2-07f922bc4b14"

echo -e "${YELLOW}Testing direct Slack webhook to n8n with workspace-wide monitoring${NC}"
echo -e "Using webhook ID: $WEBHOOK_ID"

# Create a current timestamp in the format Slack uses
TIMESTAMP=$(date +%s.%N | cut -b1-14)

# Slack message event payload - for workspace-wide monitoring
PAYLOAD=$(cat <<EOF
{
  "token": "verify_token",
  "team_id": "T123ABC",
  "api_app_id": "A123ABC",
  "event": {
    "client_msg_id": "unique-$(date +%s)",
    "type": "message",
    "text": "Test message at $(date) - workspace-wide test",
    "user": "U123ABC",
    "ts": "${TIMESTAMP}",
    "team": "T123ABC",
    "channel": "C123456",
    "channel_name": "general",
    "event_ts": "${TIMESTAMP}",
    "channel_type": "channel"
  },
  "type": "event_callback",
  "event_id": "Ev$(date +%s)",
  "event_time": $(date +%s),
  "authorizations": [
    {
      "enterprise_id": null,
      "team_id": "T123ABC",
      "user_id": "U123ABC",
      "is_bot": false
    }
  ]
}
EOF
)

echo -e "\n${YELLOW}Wait until you've clicked 'Test workflow' in n8n, then press Enter to send the webhook${NC}"
read

# Test direct to n8n
echo -e "\n${YELLOW}Sending webhook directly to n8n...${NC}"
WEBHOOK_URL="http://localhost:5678/webhook-test/${WEBHOOK_ID}/webhook"
echo "Webhook URL: ${WEBHOOK_URL}"
echo "Payload summary: Slack message event with channel='general'"

RESPONSE=$(curl -s -X POST -H "Content-Type: application/json" -H "User-Agent: Slackbot" -d "${PAYLOAD}" "${WEBHOOK_URL}")
echo -e "Response: ${RESPONSE}"

# If that didn't work, let's try a simpler message format
echo -e "\n${YELLOW}Trying a simplified message format...${NC}"
SIMPLE_PAYLOAD=$(cat <<EOF
{
  "event": {
    "type": "message",
    "text": "Simple test message at $(date)",
    "channel": "C123456", 
    "user": "U123ABC",
    "ts": "${TIMESTAMP}"
  },
  "type": "event_callback"
}
EOF
)

RESPONSE=$(curl -s -X POST -H "Content-Type: application/json" -H "User-Agent: Slackbot" -d "${SIMPLE_PAYLOAD}" "${WEBHOOK_URL}")
echo -e "Response (simple format): ${RESPONSE}"

echo -e "\n${YELLOW}Done testing webhook${NC}" 