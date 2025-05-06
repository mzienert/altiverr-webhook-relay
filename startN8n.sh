#!/bin/bash

startN8n() {
  echo "Starting n8n..."
  docker run -it -d --rm --name n8n \
    -p 5678:5678 \
    -e N8N_OAUTH2_CALLBACK_URL=https://altiverr-webhook-relay.vercel.app/api/oauth2 \
    -e N8N_EDITOR_BASE_URL=http://localhost:5678 \
    -e N8N_HOST=localhost \
    -e N8N_PROTOCOL=http \
    -e N8N_PORT=5678 \
    -e N8N_WEBHOOK_URL=https://altiverr-webhook-relay.vercel.app/api/slack-webhook \
    -e N8N_WEBHOOK_TEST_URL=https://altiverr-webhook-relay.vercel.app/api/slack-webhook \
    -v n8n_data:/home/node/.n8n \
    docker.n8n.io/n8nio/n8n
}

# Stop any existing n8n container
docker stop n8n 2>/dev/null || true

# Start n8n
startN8n

echo "n8n started with webhook relay configuration."
echo "Access the n8n editor at: http://localhost:5678" 