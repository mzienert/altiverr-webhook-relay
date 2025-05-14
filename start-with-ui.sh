#!/bin/bash

# Exit on error
set -e

echo "Building client UI..."
./build-client.sh

echo "Starting proxy with UI access..."
cd proxy && npm start

# You can access the UI at http://localhost:3333/monitor 