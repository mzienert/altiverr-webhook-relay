#!/bin/bash
# Script to start the Slack webhook consumer

# Default values
POLLING_INTERVAL=10
N8N_PORT=5678
WEBHOOK_ID=""
SQS_QUEUE_URL=${SQS_QUEUE_URL:-""}
AWS_REGION=${AWS_REGION:-"us-east-1"}

# Parse command line arguments
while [[ "$#" -gt 0 ]]; do
    case $1 in
        --polling-interval)
            POLLING_INTERVAL="$2"
            shift
            ;;
        --port)
            N8N_PORT="$2"
            shift
            ;;
        --webhook-id)
            WEBHOOK_ID="$2"
            shift
            ;;
        --queue-url)
            SQS_QUEUE_URL="$2"
            shift
            ;;
        --region)
            AWS_REGION="$2"
            shift
            ;;
        *)
            echo "Unknown parameter: $1"
            echo "Usage: $0 [--polling-interval 10] [--port 5678] [--webhook-id id] [--queue-url url] [--region region]"
            exit 1
            ;;
    esac
    shift
done

# Check required parameters
if [ -z "$SQS_QUEUE_URL" ]; then
    echo "Error: SQS_QUEUE_URL is required. Please provide it with --queue-url or set SQS_QUEUE_URL environment variable."
    exit 1
fi

# Construct the local n8n URL
LOCAL_N8N_URL="http://localhost:${N8N_PORT}"

echo "===================================="
echo "Starting Slack Webhook Consumer"
echo "===================================="
echo "  SQS Queue URL: $SQS_QUEUE_URL"
echo "  AWS Region: $AWS_REGION"
echo "  Local n8n URL: $LOCAL_N8N_URL"
echo "  Polling Interval: $POLLING_INTERVAL seconds"
if [ -n "$WEBHOOK_ID" ]; then
    echo "  Webhook ID Filter: $WEBHOOK_ID"
fi
echo "===================================="

# Set environment variables for the consumer script
export SQS_QUEUE_URL="$SQS_QUEUE_URL"
export AWS_REGION="$AWS_REGION"
export LOCAL_N8N_URL="$LOCAL_N8N_URL"
export POLLING_INTERVAL="$POLLING_INTERVAL"
export WEBHOOK_ID="$WEBHOOK_ID"

# Check if node is installed
if ! command -v node &> /dev/null; then
    echo "Error: node is not installed. Please install Node.js first."
    exit 1
fi

# Check if the consumer script exists
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
CONSUMER_SCRIPT="$SCRIPT_DIR/slack-webhook-consumer.js"

if [ ! -f "$CONSUMER_SCRIPT" ]; then
    echo "Error: Consumer script not found at $CONSUMER_SCRIPT"
    exit 1
fi

# Make the consumer script executable
chmod +x "$CONSUMER_SCRIPT"

# Check if required npm packages are installed
if ! node -e "require('aws-sdk'); require('node-fetch');" 2>/dev/null; then
    echo "Installing required npm packages..."
    npm install aws-sdk node-fetch
fi

# Start the consumer script
echo "Starting consumer script..."
node "$CONSUMER_SCRIPT" 