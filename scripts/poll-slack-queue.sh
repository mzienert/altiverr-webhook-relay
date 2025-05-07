#!/bin/bash
# Script to poll the Slack SQS queue and display messages

# Default values
API_URL="https://altiverr-webhook-relay.vercel.app/api/slack-queue"
MAX_MESSAGES=5
DELETE=false
API_KEY=${SLACK_QUEUE_API_KEY:-""}
SHOW_STATS=false
SHOW_ATTRS=false
LOCAL_TEST=false

# Parse command line arguments
while [[ "$#" -gt 0 ]]; do
    case $1 in
        --max)
            MAX_MESSAGES="$2"
            shift
            ;;
        --delete)
            DELETE=true
            ;;
        --key)
            API_KEY="$2"
            shift
            ;;
        --stats)
            SHOW_STATS=true
            ;;
        --attrs)
            SHOW_ATTRS=true
            ;;
        --url)
            API_URL="$2"
            shift
            ;;
        --local)
            LOCAL_TEST=true
            API_URL="http://localhost:3000/api/slack-queue"
            ;;
        *)
            echo "Unknown parameter: $1"
            echo "Usage: $0 [--max count] [--delete] [--key api-key] [--stats] [--attrs] [--url custom-url] [--local]"
            exit 1
            ;;
    esac
    shift
done

# Construct the query URL
QUERY_URL="${API_URL}?max=${MAX_MESSAGES}"

if [ "$DELETE" = true ]; then
    QUERY_URL="${QUERY_URL}&delete=true"
fi

if [ "$SHOW_STATS" = true ]; then
    QUERY_URL="${QUERY_URL}&stats=true"
fi

if [ "$SHOW_ATTRS" = true ]; then
    QUERY_URL="${QUERY_URL}&attributes=true"
fi

# Set up headers
HEADERS=(-H "Content-Type: application/json")

if [ -n "$API_KEY" ]; then
    HEADERS+=(-H "x-api-key: $API_KEY")
fi

echo "Polling Slack queue..."
echo "URL: $QUERY_URL"

# Make the API call
if command -v jq &> /dev/null; then
    # Using jq for pretty formatting if available
    response=$(curl -s "${HEADERS[@]}" "$QUERY_URL" | jq .)
    
    # Extract message count
    count=$(echo "$response" | jq '.count')
    
    if [ "$count" -eq 0 ]; then
        echo "No messages found in the queue."
    else
        echo "Found $count messages:"
        
        # Output messages
        echo "$response" | jq '.messages[] | {id: .id, body: .body}'
        
        # Show deletion status if applicable
        if [ "$DELETE" = true ]; then
            echo "Messages have been deleted from the queue."
        fi
    fi
    
    # Show stats if requested
    if [ "$SHOW_STATS" = true ]; then
        echo "Queue statistics:"
        echo "$response" | jq '.stats'
    fi
else
    # Fallback without jq
    response=$(curl -s "${HEADERS[@]}" "$QUERY_URL")
    echo "Response:"
    echo "$response"
    echo "Note: Install jq for better formatted output."
fi 