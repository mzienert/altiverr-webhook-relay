#!/bin/bash

# Start the Cloudflare tunnel with the correct configuration in development mode
echo "Starting Cloudflare tunnel in DEVELOPMENT mode..."
NODE_ENV=development /opt/homebrew/bin/cloudflared tunnel --config /Users/matthewzienert/.cloudflared/2a3eaa32-82c4-48ec-ba2f-d2ffee933af4.yml run 