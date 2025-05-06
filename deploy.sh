#!/bin/bash

# Load environment variables
source .env

# Deploy to Vercel
echo "Deploying to Vercel..."

# Run the deployment command
vercel --prod

echo "Deployment complete!"
echo "Run ./test-webhook.sh to test the webhook"
echo "Run ./test-queue.sh to test the queue endpoints" 