#!/bin/bash

# Script to restart the webhook relay system (proxy and tunnel)

echo "=========================================="
echo "Restarting webhook relay system"
echo "=========================================="

# Stop all services
echo "Stopping existing services..."
"$(dirname "$0")/stop-services.sh"

# Sleep a moment to ensure everything has time to shut down
echo "Waiting for services to stop..."
sleep 2

# Start proxy service
echo "Starting proxy service..."
NODE_ENV=production PORT=3333 node "$(dirname "$0")/../src/index.js" &
echo "✅ Proxy service started"

# Sleep to let proxy initialize
sleep 1

# Start Cloudflare tunnel
echo "Starting Cloudflare tunnel..."
NODE_ENV=production /opt/homebrew/bin/cloudflared tunnel --config /Users/matthewzienert/.cloudflared/2a3eaa32-82c4-48ec-ba2f-d2ffee933af4.yml run &
echo "✅ Cloudflare tunnel started"

echo "=========================================="
echo "Webhook relay system restarted"
echo "=========================================="
echo "To verify, check http://localhost:3333/health" 