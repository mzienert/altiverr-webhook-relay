#!/bin/bash

# Script to start both tunnel and proxy in development mode
echo "Starting development environment for webhook relay..."

# Function to handle cleanup on exit
cleanup() {
    echo "Shutting down services..."
    pkill -f "cloudflared tunnel --config"
    pkill -f "nodemon src/index.js"
    echo "Services stopped."
    exit 0
}

# Set up trap for cleanup
trap cleanup SIGINT SIGTERM

# Start the tunnel in the background
echo "Starting Cloudflare tunnel..."
"$(dirname "$0")/start-tunnel-dev.sh" &
TUNNEL_PID=$!
echo "Tunnel started with PID: $TUNNEL_PID"

# Give tunnel a moment to start
sleep 2

# Start the proxy
echo "Starting webhook proxy..."
"$(dirname "$0")/start-dev.sh"

# Wait for the proxy to exit
wait

# Cleanup
cleanup 