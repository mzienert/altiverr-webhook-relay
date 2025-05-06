#!/bin/bash

# Check if backup file is provided
if [ -z "$1" ]; then
  echo "⚠️ Please provide the backup file path."
  echo "Usage: ./restore-n8n.sh ./n8n-backups/n8n-backup-20230101-120000.tar"
  exit 1
fi

BACKUP_FILE="$1"

# Check if backup file exists
if [ ! -f "$BACKUP_FILE" ]; then
  echo "❌ Backup file does not exist: $BACKUP_FILE"
  exit 1
fi

echo "🔄 Restoring n8n data from backup: $BACKUP_FILE"

# Stop n8n container if running
if docker ps | grep -q n8n; then
  echo "🛑 Stopping n8n container..."
  docker stop n8n
fi

# Restore data to the volume
echo "📥 Restoring data volume..."
docker run --rm -v n8n_data:/data -v $(pwd):/backup alpine sh -c "rm -rf /data/* && tar xf /backup/$BACKUP_FILE -C /data"

# Start n8n with updated environment variables
echo "🚀 Starting n8n with updated configuration..."
startN8n

echo "✅ Restore completed successfully!"
echo "🔗 Access n8n at: http://localhost:5678" 