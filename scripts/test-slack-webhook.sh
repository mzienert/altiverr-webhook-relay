#!/bin/bash
# Script to test the Slack webhook API

# Default values
WEBHOOK_ID="test-webhook"
WEBHOOK_URL="https://altiverr-webhook-relay.vercel.app/api/slack-webhook"
LOCAL_TEST=false

# Parse command line arguments
while [[ "$#" -gt 0 ]]; do
    case $1 in
        --id)
            WEBHOOK_ID="$2"
            shift
            ;;
        --url)
            WEBHOOK_URL="$2"
            shift
            ;;
        --local)
            LOCAL_TEST=true
            ;;
        --check-env)
            # Check for environment variables
            echo "Checking environment setup..."
            if [ -z "$SLACK_SQS_QUEUE_URL" ]; then
                echo "Warning: SLACK_SQS_QUEUE_URL environment variable is not set"
                echo "Messages will not be sent to SQS"
            else
                echo "SLACK_SQS_QUEUE_URL is set: $SLACK_SQS_QUEUE_URL"
            fi
            
            if [ -z "$AWS_REGION" ]; then
                echo "Warning: AWS_REGION environment variable is not set"
            else
                echo "AWS_REGION is set: $AWS_REGION"
            fi
            
            if [ -z "$AWS_ACCESS_KEY_ID" ]; then
                echo "Warning: AWS_ACCESS_KEY_ID environment variable is not set"
            else
                echo "AWS_ACCESS_KEY_ID is set: (hidden)"
            fi
            
            if [ -z "$AWS_SECRET_ACCESS_KEY" ]; then
                echo "Warning: AWS_SECRET_ACCESS_KEY environment variable is not set"
            else
                echo "AWS_SECRET_ACCESS_KEY is set: (hidden)"
            fi
            exit 0
            ;;
        *)
            echo "Unknown parameter: $1"
            echo "Usage: $0 [--id webhook-id] [--url webhook-url] [--local] [--check-env]"
            exit 1
            ;;
    esac
    shift
done

# Construct the full webhook URL
if [[ "$LOCAL_TEST" = true ]]; then
    FULL_URL="http://localhost:3000/api/slack-webhook/$WEBHOOK_ID"
    echo "Testing local webhook endpoint at: $FULL_URL"
else
    FULL_URL="$WEBHOOK_URL/$WEBHOOK_ID"
    echo "Testing remote webhook endpoint at: $FULL_URL"
fi

# Create a sample Slack message event
MESSAGE_EVENT=$(cat <<EOF
{
  "type": "event_callback",
  "event_id": "Ev01TEST12345",
  "token": "test_token",
  "team_id": "T012345",
  "api_app_id": "A012345",
  "event": {
    "type": "message",
    "channel": "C012345",
    "user": "U012345",
    "text": "This is a test message from the webhook test script",
    "ts": "1234567890.123456",
    "event_ts": "1234567890.123456"
  }
}
EOF
)

# Create a sample Slack URL verification
URL_VERIFICATION=$(cat <<EOF
{
  "type": "url_verification",
  "challenge": "test_challenge_token_123456"
}
EOF
)

# Function to send a test webhook
send_webhook() {
    local event_type=$1
    local payload=$2
    
    echo "Sending $event_type test event..."
    
    response=$(curl -s -X POST "$FULL_URL" \
        -H "Content-Type: application/json" \
        -d "$payload")
    
    echo "Response:"
    echo "$response" | jq . 2>/dev/null || echo "$response"
    echo ""
}

# Check if jq is installed
if ! command -v jq &> /dev/null; then
    echo "Warning: jq is not installed. Response formatting will be limited."
fi

# Send URL verification test
echo "======================="
echo "1. Testing URL Verification"
echo "======================="
send_webhook "URL verification" "$URL_VERIFICATION"

# Send message event test
echo "======================="
echo "2. Testing Message Event"
echo "======================="
send_webhook "message event" "$MESSAGE_EVENT"

echo "Testing complete." 