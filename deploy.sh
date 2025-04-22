#!/bin/bash

# Load environment variables
source .env

echo "Deploying to Vercel..."

# Check if vercel CLI is installed
if ! command -v vercel &> /dev/null; then
    echo "Vercel CLI not found. Installing globally..."
    npm install -g vercel
fi

# Deploy to production
vercel --prod --token "${VERCEL_TOKEN}"

echo "Deployment complete!"
echo "Run ./test-webhook.sh to test the webhook"
echo "Run ./test-queue.sh to test the queue endpoints" 