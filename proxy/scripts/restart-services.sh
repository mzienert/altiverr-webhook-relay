#!/bin/bash

# Script to restart the webhook relay system services
echo "=========================================="
echo "Restarting webhook relay system services"
echo "=========================================="

# Stop all services
./scripts/stop-services.sh

# Wait a moment for services to fully stop
sleep 2

# Start services based on environment
if [ "$1" = "prod" ]; then
    echo "Starting services in PRODUCTION mode..."
    ./scripts/start-tunnel.sh &
    sleep 2
    npm run prod
elif [ "$1" = "dev" ]; then
    echo "Starting services in DEVELOPMENT mode..."
    ./scripts/start-dev-environment.sh
else
    echo "Starting services in PRODUCTION mode (default)..."
    ./scripts/start-tunnel.sh &
    sleep 2
    npm run prod
fi

echo "=========================================="
echo "Services restarted"
echo "==========================================" 