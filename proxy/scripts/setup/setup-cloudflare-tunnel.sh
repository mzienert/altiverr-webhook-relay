#!/bin/bash
# Script to set up Cloudflare Tunnel for the webhook proxy

# Default port for the proxy
DEFAULT_PORT=3000
PORT=${1:-$DEFAULT_PORT}

# Check if cloudflared is installed
if ! command -v cloudflared &> /dev/null; then
    echo "Error: cloudflared is not installed. Please install it first."
    echo "On macOS: brew install cloudflared"
    echo "For other systems, see: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation"
    exit 1
fi

# Check if the port is a number
if ! [[ "$PORT" =~ ^[0-9]+$ ]]; then
    echo "Error: Port must be a number"
    echo "Usage: $0 [port]"
    exit 1
fi

echo "Setting up Cloudflare Tunnel for webhook proxy on port $PORT..."

# Login to Cloudflare (if not already logged in)
echo "Checking Cloudflare login status..."
if ! cloudflared tunnel login; then
    echo "Error: Failed to log in to Cloudflare"
    exit 1
fi

# Create a tunnel
TUNNEL_NAME="webhook-proxy-$(hostname | tr '[:upper:]' '[:lower:]' | tr ' ' '-')"
echo "Creating tunnel: $TUNNEL_NAME"
TUNNEL_ID=$(cloudflared tunnel create $TUNNEL_NAME | grep -o "Created tunnel.*" | cut -d' ' -f3)

if [ -z "$TUNNEL_ID" ]; then
    echo "Error: Failed to create tunnel"
    exit 1
fi

echo "Successfully created tunnel with ID: $TUNNEL_ID"

# Create config file
CONFIG_DIR="$HOME/.cloudflared"
CONFIG_FILE="$CONFIG_DIR/$TUNNEL_ID.yml"

echo "Creating configuration file: $CONFIG_FILE"
cat > "$CONFIG_FILE" << EOF
tunnel: $TUNNEL_ID
credentials-file: $CONFIG_DIR/$TUNNEL_ID.json
ingress:
  - hostname: $TUNNEL_ID.altiverr.com
    service: http://localhost:$PORT
  - service: http_status:404
EOF

echo "Configuration file created."

# Create route for the tunnel
echo "Creating DNS record for the tunnel..."
if cloudflared tunnel route dns $TUNNEL_ID $TUNNEL_ID.altiverr.com; then
    echo "DNS record created: $TUNNEL_ID.altiverr.com"
else
    echo "Warning: Failed to create DNS record. This might be because it already exists."
fi

# Create launchd plist file for auto-restart on wake/boot
PLIST_DIR="$HOME/Library/LaunchAgents"
PLIST_FILE="$PLIST_DIR/com.altiverr.webhook-proxy-tunnel.plist"

mkdir -p "$PLIST_DIR"

echo "Creating launchd service file: $PLIST_FILE"
cat > "$PLIST_FILE" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.altiverr.webhook-proxy-tunnel</string>
    <key>ProgramArguments</key>
    <array>
        <string>$(which cloudflared)</string>
        <string>tunnel</string>
        <string>--config</string>
        <string>$CONFIG_FILE</string>
        <string>run</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>$HOME/.cloudflared/tunnel.log</string>
    <key>StandardErrorPath</key>
    <string>$HOME/.cloudflared/tunnel-error.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    </dict>
</dict>
</plist>
EOF

# Set the correct permissions for the plist file
chmod 644 "$PLIST_FILE"

echo "Launchd service file created."

# Update .env file with the tunnel URL
ENV_FILE="$(dirname "$0")/../.env"
if [ -f "$ENV_FILE" ]; then
    # Update or add PUBLIC_URL to .env file
    if grep -q "^PUBLIC_URL=" "$ENV_FILE"; then
        sed -i '' "s|^PUBLIC_URL=.*|PUBLIC_URL=https://$TUNNEL_ID.altiverr.com|" "$ENV_FILE"
    else
        echo "PUBLIC_URL=https://$TUNNEL_ID.altiverr.com" >> "$ENV_FILE"
    fi
    echo "Updated .env file with tunnel URL"
else
    echo "Warning: .env file not found. Please manually set PUBLIC_URL=https://$TUNNEL_ID.altiverr.com in your .env file."
fi

# Instructions for loading the service
echo ""
echo "=== SETUP COMPLETE ==="
echo ""
echo "Your Cloudflare Tunnel is set up with the following details:"
echo "Tunnel Name: $TUNNEL_NAME"
echo "Tunnel ID: $TUNNEL_ID"
echo "Public URL: https://$TUNNEL_ID.altiverr.com"
echo ""
echo "To start the tunnel now, run:"
echo "cloudflared tunnel --config $CONFIG_FILE run"
echo ""
echo "To load the service on startup/wake (recommended), run:"
echo "launchctl load $PLIST_FILE"
echo ""
echo "To unload the service, run:"
echo "launchctl unload $PLIST_FILE"
echo ""
echo "Tunnel logs are stored at $HOME/.cloudflared/tunnel.log"
echo ""
echo "IMPORTANT: Update your .env file to use the public URL for the proxy."
echo "PUBLIC_URL=https://$TUNNEL_ID.altiverr.com"
echo ""
echo "=== NEXT STEPS ==="
echo "1. Update the SNS topic in AWS to include the above URL as a subscription endpoint"
echo "2. Start the proxy server with 'npm start' in the proxy directory"
echo "3. Start the tunnel with the command above or load it as a service"
echo ""

# Ask if the user wants to load the service now
read -p "Do you want to load the tunnel service now? (y/n): " LOAD_SERVICE
if [[ "$LOAD_SERVICE" =~ ^[Yy]$ ]]; then
    launchctl load "$PLIST_FILE"
    echo "Service loaded. The tunnel should start automatically."
    echo "You can check the status with: launchctl list | grep webhook-proxy"
fi

# Ask if the user wants to start the tunnel now
read -p "Do you want to start the tunnel now (without the service)? (y/n): " START_TUNNEL
if [[ "$START_TUNNEL" =~ ^[Yy]$ ]]; then
    echo "Starting tunnel. Press Ctrl+C to stop."
    cloudflared tunnel --config "$CONFIG_FILE" run
fi 