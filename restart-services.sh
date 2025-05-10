#!/bin/bash

echo "=== Restarting Webhook Relay Services ==="

# Stop any running proxy service
echo "Stopping proxy service..."
pkill -f "node.*proxy/src/index.js" || true

# Stop any running cloudflared tunnel
echo "Stopping cloudflared tunnel..."
pkill -f "cloudflared.*tunnel" || true

# Just verify n8n is running in Docker without trying to start it
echo "Checking n8n status..."
if docker ps | grep -q n8n; then
  echo "n8n is running in Docker ✅"
else
  echo "⚠️ WARNING: n8n does not appear to be running in Docker"
  echo "Please ensure n8n is running before continuing."
  echo "The webhook relay requires n8n to be available at port 5678."
fi

# Set environment variables and start proxy service
echo "Starting proxy service with Docker support..."
cd proxy
export PORT=3333
export NODE_ENV=production
export LOG_LEVEL=debug
export DOCKER=true

# Start the proxy service
node src/index.js &
proxy_pid=$!
echo "Proxy service started with PID $proxy_pid"

# Give the proxy a moment to start
sleep 2

echo "Starting Cloudflare tunnel..."
# Use the Cloudflare tunnel command appropriate for your system
cloudflared_cmd="/opt/homebrew/bin/cloudflared tunnel --config /Users/matthewzienert/.cloudflared/2a3eaa32-82c4-48ec-ba2f-d2ffee933af4.yml run"
eval $cloudflared_cmd &
tunnel_pid=$!
echo "Cloudflare tunnel started with PID $tunnel_pid"

echo "=== Services restarted ==="
echo "Proxy service: PID $proxy_pid"
echo "Cloudflare tunnel: PID $tunnel_pid"
echo ""
echo "To test, run: node test-webhook.js"
echo "To verify forwarding, check the logs: tail -f proxy/logs/proxy.log" 