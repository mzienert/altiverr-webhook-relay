#!/bin/bash

# Set colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}🔄 Starting full n8n reset with backup...${NC}"

# Step 1: Create a backup
echo -e "${YELLOW}📦 Step 1: Creating backup...${NC}"
./backup-n8n.sh
if [ $? -ne 0 ]; then
  echo -e "${YELLOW}❌ Backup failed. Aborting reset.${NC}"
  exit 1
fi

# Get the latest backup file
LATEST_BACKUP=$(ls -t ./n8n-backups/n8n-backup-*.tar | head -n 1)
if [ -z "$LATEST_BACKUP" ]; then
  echo -e "${YELLOW}❌ No backup file found. Aborting reset.${NC}"
  exit 1
fi

echo -e "${GREEN}✅ Backup created: $LATEST_BACKUP${NC}"

# Step 2: Stop n8n container
echo -e "${YELLOW}🛑 Step 2: Stopping n8n container...${NC}"
docker stop n8n

# Step 3: Update environment variables
echo -e "${YELLOW}🔧 Step 3: Setting updated webhook URLs...${NC}"
# (This step is handled by your zsh profile startN8n function)

# Step 4: Restart with updated configuration
echo -e "${YELLOW}🚀 Step 4: Starting n8n with new webhook configuration...${NC}"
startN8n

echo -e "${GREEN}✅ Reset completed successfully!${NC}"
echo -e "${GREEN}🔗 Access n8n at: http://localhost:5678${NC}"
echo -e "${YELLOW}📝 Note: If something goes wrong, you can restore from:${NC} $LATEST_BACKUP"
echo -e "${YELLOW}   Run: ./restore-n8n.sh $LATEST_BACKUP${NC}" 