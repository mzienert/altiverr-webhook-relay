#!/bin/bash
# Script to set up the webhook proxy as a launchd service on macOS

# Get the absolute path to the proxy directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROXY_DIR="$(dirname "$SCRIPT_DIR")"
NODE_BIN="$(which node)"

# Default parameters
SERVICE_LABEL="com.altiverr.webhook-proxy"
USER_AGENT_DIR="$HOME/Library/LaunchAgents"
LOG_DIR="$PROXY_DIR/logs"
PLIST_FILE="$USER_AGENT_DIR/$SERVICE_LABEL.plist"

# Check if Node.js is installed
if [ -z "$NODE_BIN" ]; then
    echo "Error: Node.js is not installed or not in PATH."
    exit 1
fi

# Create the log directory if it doesn't exist
mkdir -p "$LOG_DIR"

# Create the user agent directory if it doesn't exist
mkdir -p "$USER_AGENT_DIR"

echo "Setting up webhook proxy service..."
echo "Proxy directory: $PROXY_DIR"
echo "Node binary: $NODE_BIN"

# Create the launchd plist file
cat > "$PLIST_FILE" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>$SERVICE_LABEL</string>
    <key>ProgramArguments</key>
    <array>
        <string>$NODE_BIN</string>
        <string>${PROXY_DIR}/src/index.js</string>
    </array>
    <key>WorkingDirectory</key>
    <string>${PROXY_DIR}</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${LOG_DIR}/proxy.log</string>
    <key>StandardErrorPath</key>
    <string>${LOG_DIR}/proxy-error.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
        <key>NODE_ENV</key>
        <string>production</string>
    </dict>
    <key>ThrottleInterval</key>
    <integer>30</integer>
</dict>
</plist>
EOF

# Set the correct permissions for the plist file
chmod 644 "$PLIST_FILE"

echo "Service file created at: $PLIST_FILE"

# Check if the .env file exists
if [ ! -f "$PROXY_DIR/.env" ]; then
    echo "Warning: No .env file found. Creating a basic one..."
    cat > "$PROXY_DIR/.env" << EOF
# Basic configuration for webhook proxy
NODE_ENV=production
PORT=3000
LOG_LEVEL=info

# AWS Configuration
AWS_REGION=us-west-1
SNS_TOPIC_ARN=arn:aws:sns:us-west-1:619326977873:Webhooks

# You need to update these values
PUBLIC_URL=https://your-tunnel-url.altiverr.com
N8N_WEBHOOK_URL=http://localhost:5678/webhook
EOF
    echo "Created basic .env file. Please update it with your actual settings."
fi

# Make the proxy script executable
chmod +x "$PROXY_DIR/src/index.js"

echo ""
echo "=== SETUP COMPLETE ==="
echo ""
echo "To start the service now, run:"
echo "launchctl load $PLIST_FILE"
echo ""
echo "To stop the service, run:"
echo "launchctl unload $PLIST_FILE"
echo ""
echo "Service logs will be stored at:"
echo "- ${LOG_DIR}/proxy.log"
echo "- ${LOG_DIR}/proxy-error.log"
echo ""
echo "IMPORTANT: Make sure your .env file is properly configured before starting the service."
echo "Edit it at: $PROXY_DIR/.env"
echo ""
echo "=== NEXT STEPS ==="
echo "1. Configure your .env file with proper settings"
echo "2. Install dependencies with 'npm install' if not already done"
echo "3. Load the service with the command above"
echo ""

# Ask if the user wants to load the service now
read -p "Do you want to load the service now? (y/n): " LOAD_SERVICE
if [[ "$LOAD_SERVICE" =~ ^[Yy]$ ]]; then
    launchctl load "$PLIST_FILE"
    echo "Service loaded. The proxy should start automatically."
    echo "You can check the status with: launchctl list | grep webhook-proxy"
    echo "Check the logs at: $LOG_DIR/proxy.log"
fi 