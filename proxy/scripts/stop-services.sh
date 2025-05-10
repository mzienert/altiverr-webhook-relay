#!/bin/bash

# Script to gracefully stop the Cloudflare tunnel and proxy services

echo "=========================================="
echo "Stopping webhook relay system services"
echo "=========================================="

# Find and kill cloudflared processes
echo "Stopping Cloudflare tunnel..."
tunnel_pids=$(ps aux | grep cloudflared | grep -v grep | awk '{print $2}')
if [ -n "$tunnel_pids" ]; then
  echo "Found cloudflared processes: $tunnel_pids"
  echo "$tunnel_pids" | xargs kill
  echo "✅ Cloudflare tunnel stopped"
else
  echo "⚠️ No running cloudflared processes found"
fi

# Find and kill proxy processes
echo "Stopping proxy service..."
proxy_pids=$(ps aux | grep "node src/index.js" | grep -v grep | awk '{print $2}')
if [ -n "$proxy_pids" ]; then
  echo "Found proxy processes: $proxy_pids"
  echo "$proxy_pids" | xargs kill
  echo "✅ Proxy service stopped"
else
  echo "⚠️ No running proxy processes found"
fi

echo "=========================================="
echo "All services stopped"
echo "==========================================" 