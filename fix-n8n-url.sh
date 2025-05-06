#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${YELLOW}🔧 Updating n8n webhook URLs directly in database...${NC}"

# Verify n8n is running
if ! docker ps | grep -q n8n; then
  echo -e "${RED}❌ n8n container is not running. Please start it first.${NC}"
  exit 1
fi

# Get the webhook ID from the URL shown in n8n UI
echo -e "${YELLOW}Enter the webhook ID from the n8n UI (e.g., f939a053-cc02-4c1e-9334-b83686933ff1):${NC}"
read WEBHOOK_ID

if [ -z "$WEBHOOK_ID" ]; then
  echo -e "${RED}❌ No webhook ID provided. Aborting.${NC}"
  exit 1
fi

# Create a temporary SQLite script to update the URLs
cat > /tmp/update_urls.sql <<EOF
-- Check the database structure
.tables
.schema workflows

-- Find the workflows with webhook nodes
SELECT id, name FROM workflows WHERE nodes LIKE '%"type":"n8n-nodes-base.webhook"%';

-- Update the webhook URLs
UPDATE workflows
SET nodes = replace(nodes, 
  'http://localhost:5678/webhook-test/$WEBHOOK_ID/webhook', 
  'https://altiverr-webhook-relay.vercel.app/api/slack-webhook/$WEBHOOK_ID')
WHERE nodes LIKE '%"type":"n8n-nodes-base.webhook"%'
AND nodes LIKE '%$WEBHOOK_ID%';

-- Verify changes
SELECT id, name FROM workflows WHERE nodes LIKE '%altiverr-webhook-relay%';
EOF

# Replace placeholder with actual webhook ID
sed -i '' "s/\$WEBHOOK_ID/$WEBHOOK_ID/g" /tmp/update_urls.sql

# Copy the SQL script to the container
docker cp /tmp/update_urls.sql n8n:/tmp/

# Run the SQL script inside the container
echo -e "${YELLOW}Executing SQL to update webhook URLs...${NC}"
docker exec n8n bash -c "cd /home/node/.n8n && sqlite3 database.sqlite < /tmp/update_urls.sql"

# Restart n8n to apply changes
echo -e "${YELLOW}Restarting n8n to apply changes...${NC}"
docker restart n8n

echo -e "${GREEN}✅ URL update process completed.${NC}"
echo -e "${YELLOW}Please check n8n UI to verify the webhook URL has been updated.${NC}"
echo -e "${YELLOW}If the URL isn't updated, you may need to recreate the webhook node.${NC}" 