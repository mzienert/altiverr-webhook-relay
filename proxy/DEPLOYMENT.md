# Deployment Guide for Webhook Relay System

This guide covers how to deploy the webhook relay system to production and verify it's working properly.

## ⚠️ IMPORTANT: Port Configuration

This system uses specific ports that MUST NOT be changed:

- **Proxy Service: Port 3333** - The proxy MUST run on port 3333
- **n8n: Port 5678** - n8n MUST run on its default port 5678
- **Cloudflare Tunnel** - Forwards traffic from https://webhook-proxy.altiverr.com to http://localhost:3333

See [PORTS.md](./PORTS.md) for detailed port configuration information.

## Local Testing

Before deploying to production, test the system locally:

1. Start n8n:
   ```
   docker run -it --rm \
     --name n8n \
     -p 5678:5678 \
     -v ~/.n8n:/home/node/.n8n \
     n8nio/n8n
   ```

2. Import the test workflow:
   - Open n8n at http://localhost:5678
   - Go to Workflows > Import from file
   - Select `n8n-test-workflow.json`
   - Activate the workflow

3. Start the proxy service:
   ```
   cd proxy
   PORT=3333 NODE_ENV=development npm run dev
   ```

4. Run the test script:
   ```
   node test-webhook.js
   ```

5. Verify that n8n received the webhook in the workflow execution history.

## Production Deployment

### 1. Update AWS SNS Subscription

Ensure your AWS SNS topic has a subscription to your production webhook URL:

- Protocol: HTTPS
- Endpoint: https://webhook-proxy.altiverr.com/webhook

### 2. Load Services on Boot

Set up both services to start on boot:

```bash
# Load the proxy service
launchctl load ~/Library/LaunchAgents/com.altiverr.webhook-proxy.plist

# Load the Cloudflare Tunnel service
launchctl load ~/Library/LaunchAgents/com.altiverr.webhook-proxy-tunnel.plist
```

### 3. Configure Environment Variables

Update your .env file with production settings:

```
# AWS Configuration
AWS_REGION=us-west-1
SNS_TOPIC_ARN=arn:aws:sns:us-west-1:619326977873:Webhooks

# Proxy Server Configuration
PORT=3333
HOST=0.0.0.0
NODE_ENV=production
LOG_LEVEL=info

# Cloudflare Tunnel URL
PUBLIC_URL=https://webhook-proxy.altiverr.com

# n8n Configuration 
N8N_WEBHOOK_URL=http://localhost:5678/webhook
```

### 4. Verify Production Deployment

After deployment, verify everything is working correctly:

1. Check the proxy status:
   ```
   curl https://webhook-proxy.altiverr.com/health?detailed=true
   ```

### 5. Simplified Startup

You can use the simplified startup script:

```bash
npm run prod
```

This will start the proxy on port 3333 in production mode with appropriate checks.

## Troubleshooting

If you encounter issues:

1. Check service status:
   ```
   launchctl list | grep altiverr
   ```

2. Restart services:
   ```
   launchctl unload ~/Library/LaunchAgents/com.altiverr.webhook-proxy.plist
   launchctl load ~/Library/LaunchAgents/com.altiverr.webhook-proxy.plist

   launchctl unload ~/Library/LaunchAgents/com.altiverr.webhook-proxy-tunnel.plist
   launchctl load ~/Library/LaunchAgents/com.altiverr.webhook-proxy-tunnel.plist
   ```

3. Check connection logs:
   ```
   # Proxy logs
   tail -f logs/proxy.log logs/proxy-error.log

   # Tunnel logs
   tail -f ~/.cloudflared/tunnel.log
   ```

4. Test the webhook endpoint manually:
   ```
   curl -I https://webhook-proxy.altiverr.com/health
   ```

## Production Monitoring

To monitor the system in production:

1. Set up scheduled health checks using a monitoring service
2. Configure Slack notifications in your .env file:
   ```
   SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR_WEBHOOK_URL
   NOTIFY_ON_START=true
   NOTIFY_ON_ERROR=true
   ```

3. Implement a dashboard to monitor webhook delivery statistics 