#!/bin/bash

# Start the Cloudflare tunnel with the correct configuration
echo "Starting Cloudflare tunnel in production mode..."
NODE_ENV=production /opt/homebrew/bin/cloudflared tunnel --config /Users/matthewzienert/.cloudflared/2a3eaa32-82c4-48ec-ba2f-d2ffee933af4.yml run 