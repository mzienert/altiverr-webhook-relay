#!/bin/bash

# Start the proxy service on port 3333 in production mode
echo "Starting proxy service on port 3333 in production mode..."
cd "$(dirname "$0")/.." && PORT=3333 NODE_ENV=production node src/index.js 