#!/bin/bash

# Colors for terminal output
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Set webhook ID
WEBHOOK_ID="09210404-b3f7-48c7-9cd2-07f922bc4b14"

echo -e "${YELLOW}Testing Slack webhook forwarding to n8n${NC}"
echo -e "Using webhook ID: $WEBHOOK_ID"

# Slack URL verification sample payload
PAYLOAD=$(cat <<EOF
{
  "type": "url_verification",
  "challenge": "test_challenge_string",
  "token": "test_token"
}
EOF
)

# First, verify n8n is running
echo -e "\n${YELLOW}Checking if n8n is running...${NC}"
curl -s http://localhost:5678/healthz -o /dev/null
if [ $? -eq 0 ]; then
  echo -e "${GREEN}✓ n8n is running${NC}"
else
  echo -e "${RED}✗ n8n is not running. Please start n8n first.${NC}"
  exit 1
fi

# Test the n8n webhook endpoint directly
echo -e "\n${YELLOW}Testing direct webhook to n8n...${NC}"
DIRECT_PATHS=(
  "http://localhost:5678/webhook/slack"
  "http://localhost:5678/webhook"
  "http://localhost:5678/webhook-test/slack"
  "http://localhost:5678/webhook/$WEBHOOK_ID/webhook"
  "http://localhost:5678/webhook-test/$WEBHOOK_ID/webhook"
)

for path in "${DIRECT_PATHS[@]}"; do
  echo -e "\nTrying n8n endpoint: ${path}"
  RESPONSE=$(curl -s -X POST -H "Content-Type: application/json" -H "User-Agent: Slackbot" -d "${PAYLOAD}" ${path})
  echo "Response: $RESPONSE"
done

# Test proxy webhook endpoint
echo -e "\n${YELLOW}Testing webhook through proxy...${NC}"
echo -e "Sending to: http://localhost:3333/webhook/slack"
PROXY_RESPONSE=$(curl -s -X POST -H "Content-Type: application/json" -H "User-Agent: Slackbot" -d "${PAYLOAD}" http://localhost:3333/webhook/slack)
echo "Response: $PROXY_RESPONSE"

echo -e "\n${YELLOW}Done testing webhook forwarding${NC}" 