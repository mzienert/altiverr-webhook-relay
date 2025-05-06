#!/bin/bash

# Set backup directory
BACKUP_DIR="./n8n-backups"
BACKUP_FILE="n8n-backup-$(date +%Y%m%d-%H%M%S).tar"

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

echo "🔄 Creating backup of n8n data..."

# Make sure n8n container is running
if ! docker ps | grep -q n8n; then
  echo "⚠️ n8n container is not running. Please start it before backup."
  exit 1
fi

# Export workflows and credentials using n8n CLI
echo "📤 Exporting workflows and credentials..."
docker exec n8n n8n export:workflow --all --pretty --output=/tmp/workflows-backup.json
docker exec n8n n8n export:credentials --all --output=/tmp/credentials-backup.json

# Copy backups from container to host
docker cp n8n:/tmp/workflows-backup.json ./workflows-backup.json
docker cp n8n:/tmp/credentials-backup.json ./credentials-backup.json

# Add to backup directory
cp ./workflows-backup.json "$BACKUP_DIR/"
cp ./credentials-backup.json "$BACKUP_DIR/"

# Create a tar of the entire n8n data volume
echo "📦 Creating volume backup..."
docker run --rm -v n8n_data:/data -v $(pwd)/$BACKUP_DIR:/backup alpine tar cf /backup/$BACKUP_FILE -C /data .

echo "✅ Backup completed successfully!"
echo "Backup saved to: $BACKUP_DIR/$BACKUP_FILE"
echo "Workflow and credential JSON files also available at:"
echo "- ./workflows-backup.json"
echo "- ./credentials-backup.json" 