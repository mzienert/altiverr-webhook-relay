#!/bin/bash

# Start the proxy service in development mode with explicit environment variables
echo "Starting proxy service in DEVELOPMENT mode..."
export PORT=3333
export NODE_ENV=development
export LOG_LEVEL=debug

echo "Environment variables set:"
echo "PORT=$PORT"
echo "NODE_ENV=$NODE_ENV"
echo "LOG_LEVEL=$LOG_LEVEL"

# Log the webhook URLs that will be used
echo "Using development webhook URL: $(grep N8N_WEBHOOK_URL_DEV ../.env | cut -d '=' -f2)"

# Start the proxy with nodemon for auto-reload
cd "$(dirname "$0")/.." && nodemon src/index.js 