#!/bin/bash

# Exit on error
set -e

echo "Building client UI for local use..."

# Move to client directory
cd client

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
  echo "Installing client dependencies..."
  npm install
fi

# Build the client
echo "Building client..."
npm run build

# Create proxy public directory if it doesn't exist
if [ ! -d "../proxy/public" ]; then
  echo "Creating proxy public directory..."
  mkdir -p ../proxy/public
fi

# Copy build files to proxy public directory
echo "Copying build files to proxy..."
cp -r dist/* ../proxy/public/

echo "Client UI build complete!"
echo "You can access the client at http://localhost:3333/monitor when the proxy is running." 