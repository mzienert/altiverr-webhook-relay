#!/bin/bash
# Setup script for the Slack webhook relay

# Check if ngrok is installed
if ! command -v ngrok &> /dev/null; then
    echo "ngrok is not installed. Please install it first:"
    echo "npm install -g ngrok    or    brew install ngrok"
    exit 1
fi

# Default n8n port
N8N_PORT=5678

# Parse command line arguments
while [[ "$#" -gt 0 ]]; do
    case $1 in
        --port)
            N8N_PORT="$2"
            shift
            ;;
        --webhook-id)
            WEBHOOK_ID="$2"
            shift
            ;;
        *)
            echo "Unknown parameter: $1"
            echo "Usage: $0 [--port 5678] [--webhook-id your-webhook-id]"
            exit 1
            ;;
    esac
    shift
done

# If webhook ID wasn't provided, generate one
if [ -z "$WEBHOOK_ID" ]; then
    WEBHOOK_ID=$(openssl rand -hex 8)
    echo "Generated webhook ID: $WEBHOOK_ID"
else
    echo "Using webhook ID: $WEBHOOK_ID"
fi

echo "Setting up ngrok tunnel to localhost:$N8N_PORT..."

# Start ngrok in the background
ngrok http $N8N_PORT > /dev/null &
NGROK_PID=$!

# Wait for ngrok to start
sleep 2

# Get the ngrok URL
NGROK_URL=$(curl -s http://localhost:4040/api/tunnels | grep -o '"public_url":"[^"]*' | grep -o 'http[^"]*')

if [ -z "$NGROK_URL" ]; then
    echo "Failed to get ngrok URL. Please check if ngrok is running correctly."
    kill $NGROK_PID
    exit 1
fi

echo "ngrok tunnel established: $NGROK_URL"

# Configure the relay URL
RELAY_URL="https://altiverr-webhook-relay.vercel.app/api/slack-webhook/$WEBHOOK_ID"
LOCAL_N8N_WEBHOOK_URL="$NGROK_URL/webhook/$WEBHOOK_ID"

echo ""
echo "===================================="
echo "Slack Webhook Relay Setup Complete"
echo "===================================="
echo ""
echo "1. Configure your Slack app to use this webhook URL:"
echo "   $RELAY_URL"
echo ""
echo "2. Your webhook will be forwarded to:"
echo "   $LOCAL_N8N_WEBHOOK_URL"
echo ""
echo "Press Ctrl+C to stop the ngrok tunnel when done."

# Export the environment variable
export LOCAL_N8N_WEBHOOK_URL

# Keep the script running so ngrok stays alive
echo ""
echo "Waiting for webhook requests... (Press Ctrl+C to exit)"
echo ""

# Wait for the ngrok process
wait $NGROK_PID 