#!/bin/bash

# ===================================================
# Production Startup Script for Webhook Relay System
# ===================================================

echo "=========================================="
echo "Starting webhook relay system in PRODUCTION mode"
echo "=========================================="

# Check if n8n is running
n8n_running=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:5678 || echo "000")
if [ "$n8n_running" != "200" ]; then
  echo "⚠️  WARNING: n8n does not appear to be running on port 5678"
  echo "Please start n8n with: docker run -it -p 5678:5678 -v ~/.n8n:/home/node/.n8n n8nio/n8n"
  echo ""
fi

# Check if the proxy is already running
proxy_running=$(lsof -i:3333 -sTCP:LISTEN | grep node || echo "")
if [ -n "$proxy_running" ]; then
  echo "⚠️  WARNING: A process is already running on port 3333"
  echo "Process details: $proxy_running"
  echo "You may need to kill this process before starting the proxy"
  echo ""
fi

# Check if the tunnel is running
tunnel_running=$(ps aux | grep cloudflared | grep -v grep || echo "")
if [ -z "$tunnel_running" ]; then
  echo "⚠️  WARNING: Cloudflare tunnel does not appear to be running"
  echo "Please start the tunnel with: cloudflared tunnel run webhook-proxy"
  echo ""
fi

echo "=========================================="
echo "⚠️  PORT CONFIGURATION WARNING"
echo "The proxy MUST run on port 3333"
echo "Do not change this unless you update the Cloudflare tunnel configuration"
echo "=========================================="

# Start the proxy in production mode on port 3333
echo "Starting proxy on port 3333 in production mode..."
export PORT=3333
export NODE_ENV=production
npm start 