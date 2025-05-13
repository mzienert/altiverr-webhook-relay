#!/bin/bash

# Colors for terminal output
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Set webhook ID
WEBHOOK_ID="09210404-b3f7-48c7-9cd2-07f922bc4b14"

echo -e "${YELLOW}Testing Slack webhook forwarding to n8n PRODUCTION webhook${NC}"
echo -e "Using webhook ID: $WEBHOOK_ID"

# Create a current timestamp in the format Slack uses
TIMESTAMP=$(date +%s.%N | cut -b1-14)

# Slack message event payload
PAYLOAD=$(cat <<EOF
{
  "token": "verify_token",
  "team_id": "T123ABC",
  "api_app_id": "A123ABC",
  "event": {
    "client_msg_id": "unique-$(date +%s)",
    "type": "message",
    "text": "Production test message at $(date)",
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
  "event_time": $(date +%s)
}
EOF
)

# Test direct to n8n production webhook
echo -e "\n${YELLOW}Sending webhook directly to n8n production webhook...${NC}"
WEBHOOK_URL="http://localhost:5678/webhook/${WEBHOOK_ID}/webhook"
echo "Webhook URL: ${WEBHOOK_URL}"

RESPONSE=$(curl -s -X POST -H "Content-Type: application/json" -H "User-Agent: Slackbot" -d "${PAYLOAD}" "${WEBHOOK_URL}")
echo -e "Direct response: ${RESPONSE}"

# Now test through the proxy
echo -e "\n${YELLOW}Sending webhook through proxy to production endpoint...${NC}"
PROXY_URL="http://localhost:3333/webhook/${WEBHOOK_ID}/webhook"
echo "Proxy URL: ${PROXY_URL}"

PROXY_RESPONSE=$(curl -s -X POST -H "Content-Type: application/json" -H "User-Agent: Slackbot" -d "${PAYLOAD}" "${PROXY_URL}")
echo -e "Proxy response: ${PROXY_RESPONSE}"

echo -e "\n${YELLOW}Done testing production webhook${NC}" 