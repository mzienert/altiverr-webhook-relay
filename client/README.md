# Proxy Monitor Client

A local-only UI for monitoring the webhook relay proxy.

## Features

- Real-time proxy status monitoring
- Live log viewer with filtering capabilities
- Configuration viewer
- Proxy mode switching between development and production
- Proxy restart functionality

## Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

## Building

To build the client and deploy it to the proxy:

```bash
# From the project root
npm run build-client
```

## Accessing the UI

Once the proxy is running and the client is built, access the UI at:

```
http://localhost:3333/monitor
```

## Note

This UI is designed for local use only and is not deployed to Vercel along with the API.
The `.vercelignore` file is configured to exclude the client directory from deployment.
