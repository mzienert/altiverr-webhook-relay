#!/bin/bash

# Enhanced production startup script for Cloudflare tunnel
echo "=========================================="
echo "Starting Cloudflare tunnel in PRODUCTION mode"
echo "=========================================="

# Set environment variables
export NODE_ENV=production

# Check if cloudflared is installed
if ! command -v cloudflared &> /dev/null; then
    echo "Error: cloudflared is not installed or not in PATH."
    echo "Please install it with: brew install cloudflared"
    exit 1
fi

# Path to cloudflared config
CLOUDFLARED_PATH="/opt/homebrew/bin/cloudflared"
CONFIG_PATH="/Users/matthewzienert/.cloudflared/2a3eaa32-82c4-48ec-ba2f-d2ffee933af4.yml"

# Create logs directory if it doesn't exist
SCRIPT_DIR="$(dirname "$0")"
PROJECT_ROOT="$SCRIPT_DIR/.."
LOG_DIR="$PROJECT_ROOT/logs"
mkdir -p "$LOG_DIR"

# Check if config file exists
if [ ! -f "$CONFIG_PATH" ]; then
    echo "Error: Cloudflare tunnel config not found at $CONFIG_PATH"
    echo "Please run setup-cloudflare-tunnel.sh first"
    exit 1
fi

echo "Using configuration: $CONFIG_PATH"
echo "Logs will be available at $LOG_DIR/tunnel-production.log"
echo "Starting Cloudflare tunnel..."

# Start the tunnel in the foreground with more debugging
exec "$CLOUDFLARED_PATH" tunnel --loglevel info --config "$CONFIG_PATH" run 2>&1 | tee "$LOG_DIR/tunnel-production.log" 