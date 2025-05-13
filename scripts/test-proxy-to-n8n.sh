#!/bin/bash

# Colors for terminal output
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Testing Slack webhook through proxy to n8n${NC}"

# Create a current timestamp in the format Slack uses
TIMESTAMP=$(date +%s.%N | cut -b1-14)

# Slack message event payload for workspace-wide monitoring
PAYLOAD=$(cat <<EOF
{
  "token": "verify_token",
  "team_id": "T123ABC",
  "api_app_id": "A123ABC",
  "event": {
    "client_msg_id": "unique-$(date +%s)",
    "type": "message",
    "text": "Proxy test message at $(date) - sent through webhook relay",
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

echo -e "\n${YELLOW}Wait until you've clicked 'Test workflow' in n8n, then press Enter to send the webhook${NC}"
read

# Test through proxy
echo -e "\n${YELLOW}Sending webhook through proxy...${NC}"
PROXY_URL="http://localhost:3333/webhook/slack"
echo "Proxy URL: ${PROXY_URL}"
echo "Payload summary: Slack message event with channel='general'"

RESPONSE=$(curl -s -X POST -H "Content-Type: application/json" -H "User-Agent: Slackbot" -d "${PAYLOAD}" "${PROXY_URL}")
echo -e "Response from proxy: ${RESPONSE}"

echo -e "\n${YELLOW}Done testing webhook${NC}" 