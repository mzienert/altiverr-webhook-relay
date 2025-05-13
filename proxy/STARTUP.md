# Webhook Relay System Startup Procedures

This document outlines the exact commands needed to start the webhook relay system components.

## Starting n8n

```bash
docker run -it --rm \
  --name n8n \
  -p 5678:5678 \
  -v ~/.n8n:/home/node/.n8n \
  n8nio/n8n
```

## Starting the Proxy Service

```bash
cd proxy
PORT=3333 NODE_ENV=production node src/index.js
```

You can also use the npm script:
```bash
cd proxy
npm run prod
```

## Starting the Cloudflare Tunnel

```bash
# Use the exact configuration file path with the tunnel ID
NODE_ENV=production /opt/homebrew/bin/cloudflared tunnel --config /Users/matthewzienert/.cloudflared/2a3eaa32-82c4-48ec-ba2f-d2ffee933af4.yml run
```

You can also use the npm script:
```bash
cd proxy
npm run tunnel
```

## Verification Commands

After starting the services, verify they are running correctly:

1. Check the proxy health:
   ```bash
   curl http://localhost:3333/health
   ```

2. Check if the Cloudflare tunnel is running:
   ```bash
   ps aux | grep cloudflared | grep -v grep
   ```

3. Test a direct webhook to n8n:
   ```bash
   cd proxy
   NODE_ENV=production node test-direct-n8n.js
   ```

## Testing Webhook Delivery

To verify the complete webhook relay system is working end-to-end:

### Test Local Proxy Delivery

This tests webhook delivery directly to the local proxy (bypassing the tunnel):

```bash
cd proxy
npm run test-local
```

### Test Tunnel Delivery

This tests the complete flow, sending a webhook through the Cloudflare tunnel:

```bash
cd proxy
npm run test-tunnel
```

Both tests will check if required services are running before attempting to send test messages.

## Development Environment

For local development and testing, we have dedicated scripts to run the services in development mode.

### Starting the Development Environment

Method 1: Complete development environment in one terminal:
```bash
cd proxy
npm run dev-environment
```
This starts both the proxy (with auto-reload) and tunnel in development mode. Press Ctrl+C to stop both services.

Method 2: Start services separately:
```bash
# Terminal 1: Start the proxy in dev mode with auto-reload
cd proxy
npm run dev

# Terminal 2: Start the tunnel in dev mode
cd proxy
npm run tunnel-dev
```

### Development Mode vs Production Mode

- **Development Mode**: Uses `NODE_ENV=development`, enables debug logging, and auto-reloads the proxy when code changes (via nodemon)
- **Production Mode**: Uses `NODE_ENV=production`, reduces logging verbosity, and runs without auto-reload

## Stopping the Services

### Manual Method

1. Stop the Cloudflare tunnel with Ctrl+C in its terminal
2. Stop the proxy service with Ctrl+C in its terminal
3. Stop n8n with `docker stop n8n`

### Using Stop Script

To automatically stop both the proxy and tunnel:

```bash
cd proxy
npm run stop
```

Or run the script directly:

```bash
./scripts/stop-services.sh
```

This will find and gracefully terminate all running proxy and tunnel processes.

## Restarting the Services

To restart both the proxy and Cloudflare tunnel in one command:

```bash
cd proxy
npm run restart
```

Or run the script directly:

```bash
./scripts/restart-services.sh
```

This will:
1. Stop all running proxy and tunnel processes
2. Wait for them to terminate
3. Start the proxy service (on port 3333 in production mode)
4. Start the Cloudflare tunnel with the correct configuration

Note: This only restarts the proxy and tunnel, not n8n. 