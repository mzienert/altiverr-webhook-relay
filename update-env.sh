#!/bin/bash

# Create a backup of the existing .env file
cp proxy/.env proxy/.env.backup

# Create the new .env file with host.docker.internal
cat > proxy/.env << 'EOF'
PORT=3333

# Production endpoint for n8n with Docker host
N8N_WEBHOOK_URL=http://host.docker.internal:5678/webhook/calendly

# Test endpoint for n8n (used in development)
N8N_WEBHOOK_URL_DEV=http://host.docker.internal:5678/webhook-test/calendly

# Legacy settings
N8N_WEBHOOK_ENDPOINT=webhook
N8N_WEBHOOK_PATH=/calendly
EOF

echo "Updated proxy/.env to use host.docker.internal" 