# Managing the Webhook Proxy with PM2

This guide explains how to use PM2 to manage the webhook proxy service during development and in production.

## Why PM2?

PM2 offers several advantages over using macOS LaunchAgents:
- Easier development workflow with automatic reloading
- Simple command-line management
- Process monitoring and logs in one place
- Automatic restart on crashes
- Environment variable management for different configs

## Setup

PM2 should already be installed globally:
```
npm install -g pm2
```

## Basic Commands

### Starting the proxy

**IMPORTANT**: Due to Cloudflare tunnel requirements, only one environment can run at a time (both use port 3333).

For development (with auto-reload on file changes):
```
pm2 start ecosystem.config.cjs --only webhook-proxy-dev
```

For production:
```
pm2 start ecosystem.config.cjs --only webhook-proxy-prod
```

### Stopping the proxy

```
pm2 stop webhook-proxy-dev  # or webhook-proxy-prod
```

### Restarting the proxy

```
pm2 restart webhook-proxy-dev  # or webhook-proxy-prod
```

### Viewing logs

```
pm2 logs webhook-proxy-dev  # or webhook-proxy-prod
```

### Viewing status

```
pm2 status
```

## Switching Between Environments

To switch from development to production:
```
pm2 stop webhook-proxy-dev
pm2 start ecosystem.config.cjs --only webhook-proxy-prod
```

To switch from production to development:
```
pm2 stop webhook-proxy-prod
pm2 start ecosystem.config.cjs --only webhook-proxy-dev
```

## Running at Startup

If you want PM2 to start the proxy automatically on login:

```
pm2 startup
```

Then follow the instructions provided by the command.

After configuring your desired services, save the current process list:
```
pm2 save
```

## Managing the Tunnel Service

The Cloudflare tunnel service is still managed via launchd:

Enable:
```
mv ~/Library/LaunchAgents/com.altiverr.webhook-proxy-tunnel.plist.disabled ~/Library/LaunchAgents/com.altiverr.webhook-proxy-tunnel.plist
launchctl bootstrap gui/$UID ~/Library/LaunchAgents/com.altiverr.webhook-proxy-tunnel.plist
```

Disable:
```
launchctl bootout gui/$UID ~/Library/LaunchAgents/com.altiverr.webhook-proxy-tunnel.plist
mv ~/Library/LaunchAgents/com.altiverr.webhook-proxy-tunnel.plist ~/Library/LaunchAgents/com.altiverr.webhook-proxy-tunnel.plist.disabled
``` 