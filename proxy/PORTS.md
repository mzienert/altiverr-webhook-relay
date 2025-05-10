# Webhook Relay System Port Configuration

This document defines the official port assignments for the webhook relay system. **DO NOT CHANGE THESE PORT ASSIGNMENTS** without updating all related configurations and documentation.

## Port Assignments

| Service | Port | Environment Variable | Notes |
|---------|------|---------------------|-------|
| **Proxy Service** | 3333 | `PORT=3333` | The proxy service should ALWAYS run on port 3333. This is what the Cloudflare tunnel is configured to connect to. |
| **n8n** | 5678 | n/a | n8n's default port is 5678. Do not change this as it's referenced in many configurations. |
| **Cloudflare Tunnel** | n/a | n/a | The tunnel forwards traffic from https://webhook-proxy.altiverr.com to http://localhost:3333 |

## Connection Flow

1. External webhook → Cloudflare Tunnel (https://webhook-proxy.altiverr.com)
2. Cloudflare Tunnel → Local Proxy (http://localhost:3333)
3. Local Proxy → n8n (http://localhost:5678)

## Common Issues

- If you see errors like `dial tcp [::1]:3333: connect: connection refused`, it means the proxy service is not running on port 3333.
- Always start the proxy with `PORT=3333 NODE_ENV=production node src/index.js` to ensure it's using the correct port.
- Do not change the port in environment variables or configuration files without updating all components.

## Startup Procedure

1. Start n8n:
   ```bash
   docker run -it --rm \
     --name n8n \
     -p 5678:5678 \
     -v ~/.n8n:/home/node/.n8n \
     n8nio/n8n
   ```

2. Start proxy:
   ```bash
   cd proxy
   PORT=3333 NODE_ENV=production node src/index.js
   ```

3. Start tunnel:
   ```bash
   NODE_ENV=production /opt/homebrew/bin/cloudflared tunnel --config /Users/matthewzienert/.cloudflared/2a3eaa32-82c4-48ec-ba2f-d2ffee933af4.yml run
   ```

For detailed startup procedures, see [STARTUP.md](./STARTUP.md).

## Shutdown Procedure

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