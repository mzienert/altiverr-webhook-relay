#!/bin/bash

# Script to test sending a webhook to the debug endpoint
echo "=========================================="
echo "Testing webhook delivery to debug endpoint"
echo "=========================================="

# Change directory to the project root
cd "$(dirname "$0")/.."

# Check if the proxy is running
PROXY_RUNNING=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3333/health || echo "000")
if [ "$PROXY_RUNNING" != "200" ]; then
  echo "⚠️  WARNING: The proxy doesn't appear to be running on port 3333"
  echo "Please start the proxy first with: npm run dev or npm run prod"
  exit 1
fi

echo "Proxy is running. Sending test webhook to debug endpoint..."
node scripts/test-debug-webhook.js

# The script output will contain a note about n8n if it's not running
# That's expected if you're just testing the proxy itself 