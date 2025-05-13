#!/bin/bash

# Enhanced production startup script for the webhook proxy service
echo "=========================================="
echo "Starting webhook proxy in PRODUCTION mode"
echo "=========================================="

# Set production environment variables
export PORT=3333
export NODE_ENV=production
export LOG_LEVEL=info

# Create logs directory if it doesn't exist
SCRIPT_DIR="$(dirname "$0")"
PROJECT_ROOT="$SCRIPT_DIR/.."
LOG_DIR="$PROJECT_ROOT/logs"
mkdir -p "$LOG_DIR"

echo "Environment variables set:"
echo "PORT=$PORT"
echo "NODE_ENV=$NODE_ENV"
echo "LOG_LEVEL=$LOG_LEVEL"

# Check if node is installed
if ! command -v node &> /dev/null; then
    echo "Error: Node.js is not installed or not in PATH."
    exit 1
fi

# Change to the project root directory
cd "$PROJECT_ROOT"

# Start the proxy service with output logging
echo "Starting proxy on port $PORT..."
echo "Logs will be available at $LOG_DIR/proxy-production.log"

# Use nohup for detached operation if needed, otherwise leave as is
node src/index.js > "$LOG_DIR/proxy-production.log" 2>&1 