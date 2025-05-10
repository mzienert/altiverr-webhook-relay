# Altiverr Webhook Proxy

A local proxy service that receives webhook notifications from AWS SNS and forwards them to n8n. This is part of the event-driven webhook relay system.

## Overview

This proxy service solves the "offline problem" by:

1. Subscribing to AWS SNS topics using a public Cloudflare Tunnel URL
2. Automatically handling SNS subscription confirmation
3. Receiving webhook notifications in real-time
4. Processing and forwarding them to your local n8n instance
5. Ensuring idempotency (no duplicate processing)
6. Auto-restarting on wake/boot via launchd

When your MacBook is offline, webhook messages are buffered in AWS SNS for up to 14 days. When you come back online, the proxy automatically reconnects and receives the buffered messages.

## ⚠️ IMPORTANT: Port Configuration

This system uses specific ports that MUST NOT be changed:

- **Proxy Service: Port 3333** - The proxy MUST run on port 3333 as this is what the Cloudflare tunnel is configured to connect to
- **n8n: Port 5678** - n8n MUST run on its default port 5678
- **Cloudflare Tunnel** - Forwards traffic from https://webhook-proxy.altiverr.com to http://localhost:3333

See [PORTS.md](./PORTS.md) for detailed port configuration information and [STARTUP.md](./STARTUP.md) for exact startup procedures.

## Quick Start

To start the system correctly:

1. Start n8n (in a separate terminal):
   ```bash
   docker run -it --rm --name n8n -p 5678:5678 -v ~/.n8n:/home/node/.n8n n8nio/n8n
   ```

2. Start the proxy service (in a separate terminal):
   ```bash
   cd proxy
   npm run prod
   ```

3. Start the Cloudflare tunnel (in a separate terminal):
   ```bash
   cd proxy
   npm run tunnel
   ```

## Stopping the Services

To stop all components of the system:

1. Stop the proxy and tunnel services:
   ```bash
   cd proxy
   npm run stop
   ```

2. Stop n8n:
   ```bash
   docker stop n8n
   ```

## Restarting the Services

To restart the webhook relay system (proxy and tunnel):

```bash
cd proxy
npm run restart
```

This will stop any running instances and start fresh ones in the background.

## Requirements

- Node.js 18+ 
- macOS for launchd service scripts (works on other platforms but without auto-restart)
- Cloudflare account (free tier is sufficient)
- AWS SNS topic already set up

## Installation

1. Install dependencies:

```bash
npm install
```

2. Create a `.env` file (or copy from `.env.example`) and configure it:

```
# AWS Configuration
AWS_REGION=us-west-1
SNS_TOPIC_ARN=arn:aws:sns:us-west-1:YOUR_ACCOUNT_ID:Webhooks

# Proxy Server Configuration
PORT=3000
HOST=0.0.0.0
NODE_ENV=development
LOG_LEVEL=debug

# This will be updated automatically by the tunnel setup script
PUBLIC_URL=https://your-tunnel-url.trycloudflare.com 

# n8n Configuration 
N8N_WEBHOOK_URL=http://localhost:5678/webhook
```

3. Install cloudflared (required for Cloudflare Tunnel):

```bash
brew install cloudflared
```

## Setup

### 1. Set Up Cloudflare Tunnel

Run the tunnel setup script:

```bash
./scripts/setup-cloudflare-tunnel.sh
```

This will:
- Create a Cloudflare Tunnel
- Configure it to point to your local proxy
- Create a launchd service for auto-restart
- Update your `.env` file with the tunnel URL

### 2. Set Up Proxy Service

Run the proxy setup script:

```bash
./scripts/setup-proxy-service.sh
```

This will:
- Create a launchd service for the proxy
- Set it to auto-start on boot/wake
- Configure logging

### 3. Subscribe to SNS

After setting up the tunnel, you need to update your SNS topic to allow subscriptions from your public URL:

1. Log in to AWS Console
2. Navigate to SNS → Topics → Your topic (e.g., "Webhooks")
3. Click "Create subscription"
4. Protocol: HTTPS
5. Endpoint: Your tunnel URL + "/sns" (e.g., https://your-tunnel-url.trycloudflare.com/sns)
6. Click "Create subscription"

The proxy will automatically confirm the subscription when it receives the confirmation request.

## Usage

### Development Mode (with auto-reload)

When developing or making changes to the code, you should run the proxy in development mode, which uses nodemon to automatically restart the service when files change:

1. First, unload the service if it's running:
```bash
launchctl unload ~/Library/LaunchAgents/com.altiverr.webhook-proxy.plist
```

2. Run in development mode:
```bash
npm run dev
```

3. When you're done, you can either reload the service for production mode or continue developing:
```bash
launchctl load ~/Library/LaunchAgents/com.altiverr.webhook-proxy.plist
```

### Running as a Service (Production)

In production mode, the proxy runs as a launchd service that automatically starts on boot/wake and restarts if it crashes:

```bash
# Start the proxy service
launchctl load ~/Library/LaunchAgents/com.altiverr.webhook-proxy.plist

# Start the tunnel service
launchctl load ~/Library/LaunchAgents/com.altiverr.webhook-proxy-tunnel.plist
```

### Checking Status

```bash
# Check if services are running
launchctl list | grep altiverr

# Check logs
tail -f logs/proxy.log
```

### Switching Between Modes

When switching between development and production modes:

1. **From production to development:**
   - Unload the service: `launchctl unload ~/Library/LaunchAgents/com.altiverr.webhook-proxy.plist`
   - Start dev mode: `npm run dev`

2. **From development to production:**
   - Stop the dev process (Ctrl+C)
   - Load the service: `launchctl load ~/Library/LaunchAgents/com.altiverr.webhook-proxy.plist`

## How It Works

1. **Cloudflare Tunnel** provides a public HTTPS endpoint for your local proxy
2. **SNS** sends messages to this endpoint when webhooks are received
3. **Local Proxy** receives these messages and forwards them to n8n
4. **launchd** ensures both services restart on wake/boot

## Troubleshooting

### Tunnel Issues

- Check tunnel logs: `~/.cloudflared/tunnel.log`
- Ensure cloudflared is running: `ps aux | grep cloudflared`
- Try restarting the tunnel: `launchctl unload ~/Library/LaunchAgents/com.altiverr.webhook-proxy-tunnel.plist && launchctl load ~/Library/LaunchAgents/com.altiverr.webhook-proxy-tunnel.plist`

### Proxy Issues

- Check proxy logs: `tail -f logs/proxy.log logs/proxy-error.log`
- Ensure the proxy is running: `curl http://localhost:3000/health`
- Check if n8n is reachable: `curl http://localhost:5678`

### SNS Issues

- Check SNS subscription status in AWS Console
- Ensure your tunnel URL is correctly formatted in the subscription
- Try manually triggering a webhook to test

## License

ISC © Matthew Zienert 