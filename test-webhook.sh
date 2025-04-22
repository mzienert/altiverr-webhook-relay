#!/bin/bash

# Load environment variables
source .env

# Use the direct webhook URL
WEBHOOK_URL="https://altiverr-webhook-relay.vercel.app/api/webhook"
echo "Using webhook URL: $WEBHOOK_URL"

# Create a Node.js script to generate the signature and send the request
cat > test-request.js << 'EOF'
// Import required modules
const crypto = require('crypto');
const https = require('https');

// Get environment variables from process
const SIGNING_KEY = process.env.SIGNING_KEY;
const WEBHOOK_URL = process.env.WEBHOOK_URL;

// Generate timestamp in ISO format
const timestamp = new Date().toISOString();

// Create the payload object directly in JavaScript (not as a string)
const payload = {
  event: 'invitee.created',
  time: timestamp,
  payload: {
    event_type: 'TEST',
    event: {
      uuid: `test-event-${Date.now()}`,
      name: 'Test Event'
    },
    invitee: {
      uuid: `test-invitee-${Date.now()}`,
      email: 'test@example.com',
      name: 'Test User'
    }
  }
};

// Stringify the payload exactly as the server will do
const stringifiedPayload = JSON.stringify(payload);

// Create the signature exactly as the server will verify it
const signaturePayload = `${timestamp}.${stringifiedPayload}`;
const signature = crypto
  .createHmac('sha256', SIGNING_KEY)
  .update(signaturePayload)
  .digest('hex');

// Debug info
console.log('===== DEBUG INFO =====');
console.log('Webhook URL:', WEBHOOK_URL);
console.log('Timestamp:', timestamp);
console.log('Signing Key (first 6 chars):', SIGNING_KEY.substring(0, 6) + '...');
console.log('Signature:', signature);
console.log('=====================');
console.log('\nSending request...');

// Parse the URL to get host, path, etc.
const url = new URL(WEBHOOK_URL);

// Set up request options
const options = {
  hostname: url.hostname,
  port: 443,
  path: url.pathname,
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-calendly-signature': signature,
    'x-calendly-timestamp': timestamp,
    'Content-Length': Buffer.byteLength(stringifiedPayload)
  }
};

// Make the request
const req = https.request(options, (res) => {
  let data = '';
  
  // Collect response data
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  // Process the complete response
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    try {
      const parsedData = JSON.parse(data);
      console.log(JSON.stringify(parsedData, null, 2));
    } catch (e) {
      console.log('Response:', data);
    }
  });
});

// Handle errors
req.on('error', (error) => {
  console.error('Error:', error.message);
});

// Send the actual payload
req.write(stringifiedPayload);
req.end();
EOF

# Run the node script with the environment variables
export SIGNING_KEY="${CALENDLY_WEBHOOK_SIGNING_KEY}"
export WEBHOOK_URL="${WEBHOOK_URL}"
node test-request.js

# Clean up
rm -f test-request.js 