#!/bin/bash

# Script to test sending a webhook through the Cloudflare tunnel
echo "=========================================="
echo "Testing webhook delivery through Cloudflare tunnel"
echo "=========================================="

# Change directory to the project root
cd "$(dirname "$0")/.."

# Check if the tunnel is running, use a broader search pattern
TUNNEL_RUNNING=$(ps aux | grep "cloudflared" | grep "tunnel.*run" || echo "")
if [ -z "$TUNNEL_RUNNING" ]; then
  echo "⚠️  WARNING: The Cloudflare tunnel doesn't appear to be running"
  echo "Please start the tunnel first with: npm run tunnel or npm run tunnel-dev"
  
  # For testing purposes, we can skip this check
  if [ "$1" != "--skip-checks" ]; then
    exit 1
  else
    echo "Skipping tunnel check (--skip-checks flag used)"
  fi
fi

# Also check if the proxy is running
PROXY_RUNNING=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3333/health || echo "000")
if [ "$PROXY_RUNNING" != "200" ]; then
  echo "⚠️  WARNING: The proxy doesn't appear to be running on port 3333"
  echo "Please start the proxy first with: npm run dev or npm run prod"
  exit 1
fi

echo "Proxy is running. Sending test webhook through tunnel..."

# We know the hostname from the config file
HOSTNAME="webhook-proxy.altiverr.com"

echo "Using tunnel hostname: $HOSTNAME"

# Create payload for test
PAYLOAD="{
  \"eventType\": \"TUNNEL_TEST_EVENT\",
  \"timestamp\": \"$(date -u +"%Y-%m-%dT%H:%M:%SZ")\",
  \"data\": {
    \"id\": \"tunnel-test-$(date +%s)\",
    \"source\": \"tunnel-test-script\",
    \"value\": \"test-value-$(date +%s | shasum | cut -c1-8)\"
  }
}"

# Send request
echo "Sending request to https://$HOSTNAME/debug/webhook"
echo "Payload: $PAYLOAD"

# Use curl to send the webhook
echo "Sending request..."
curl -v -X POST -H "Content-Type: application/json" -H "X-Test-Header: tunnel-test" \
  -d "$PAYLOAD" \
  "https://$HOSTNAME/debug/webhook" || echo "Failed to send webhook" 