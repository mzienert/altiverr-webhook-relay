#!/bin/bash

# Script to start both tunnel and proxy in production mode
echo "=========================================="
echo "Starting production environment for webhook relay..."
echo "=========================================="

# Create logs directory if it doesn't exist
SCRIPT_DIR="$(dirname "$0")"
PROJECT_ROOT="$SCRIPT_DIR/.."
LOG_DIR="$PROJECT_ROOT/logs"
mkdir -p "$LOG_DIR"

# Function to cleanup and exit
cleanup() {
    echo "Shutting down services..."
    pkill -f "cloudflared tunnel --config"
    pkill -f "node src/index.js"
    echo "Services stopped."
    exit 0
}

# Set up trap for cleanup
trap cleanup SIGINT SIGTERM

echo "Starting production environment with tunnel and proxy in foreground mode..."
echo "The terminal will be blocked. Press Ctrl+C to stop all services."
echo "=========================================="

# Start both processes in the foreground
# This ensures they won't be terminated when the script ends
"$SCRIPT_DIR/start-tunnel.sh" & 
TUNNEL_PID=$!
echo "Tunnel started with PID: $TUNNEL_PID"

# Give tunnel a moment to start
sleep 3

# Start the proxy
"$SCRIPT_DIR/start-production.sh" &
PROXY_PID=$!
echo "Proxy started with PID: $PROXY_PID"

echo "=========================================="
echo "Both services are now running."
echo "Tunnel PID: $TUNNEL_PID"
echo "Proxy PID: $PROXY_PID"
echo "Logs are available at:"
echo "- $LOG_DIR/tunnel-production.log" 
echo "- $LOG_DIR/proxy-production.log"
echo "Press Ctrl+C to stop all services"
echo "=========================================="

# Wait for processes to exit naturally or for a signal
wait 