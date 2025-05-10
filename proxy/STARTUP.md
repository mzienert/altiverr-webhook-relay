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