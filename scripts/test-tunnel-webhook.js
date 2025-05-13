#!/usr/bin/env node

// Script to test the webhook relay by sending a message through the Cloudflare tunnel
import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

// Setup proper paths for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Load environment variables
dotenv.config({ path: path.resolve(rootDir, '.env') });

// For testing, use the debug route that bypasses SNS validation
const USE_DEBUG_ROUTE = true;
const WEBHOOK_PATH = USE_DEBUG_ROUTE ? '/debug/webhook' : '/sns';

// Try to determine the tunnel URL
let tunnelUrl;

// First check if it's in the .env file
if (process.env.PUBLIC_URL) {
  tunnelUrl = process.env.PUBLIC_URL + WEBHOOK_PATH;
} else {
  // If not in .env, try to get it from the Cloudflare config file
  try {
    const homedir = process.env.HOME || process.env.USERPROFILE;
    const configPath = path.join(homedir, '.cloudflared', '2a3eaa32-82c4-48ec-ba2f-d2ffee933af4.yml');
    
    if (fs.existsSync(configPath)) {
      const configContent = fs.readFileSync(configPath, 'utf8');
      const hostnameMatch = configContent.match(/hostname:\s*([^\s]+)/);
      
      if (hostnameMatch && hostnameMatch[1]) {
        tunnelUrl = `https://${hostnameMatch[1]}${WEBHOOK_PATH}`;
      }
    }
  } catch (error) {
    console.error('Error reading Cloudflare config:', error.message);
  }
}

// Default fallback if we couldn't determine it
if (!tunnelUrl) {
  tunnelUrl = 'https://webhook-proxy.altiverr.com' + WEBHOOK_PATH;
}

// Create a mock message payload
const mockMessage = {
  eventType: 'TUNNEL_TEST_EVENT',
  timestamp: new Date().toISOString(),
  data: {
    id: 'tunnel-test-' + Date.now(),
    source: 'tunnel-webhook-test-script',
    value: Math.random().toString(36).substring(2, 15)
  }
};

// Create a mock SNS message payload
const mockSnsMessage = {
  Type: 'Notification',
  MessageId: 'tunnel-test-' + Date.now(),
  TopicArn: process.env.SNS_TOPIC_ARN || 'arn:aws:sns:test:test:Webhooks',
  Message: JSON.stringify(mockMessage),
  Timestamp: new Date().toISOString(),
  SignatureVersion: '1',
  Signature: 'test-signature',
  SigningCertURL: 'https://example.com/cert.pem',
};

// Function to send the test webhook
async function sendTestWebhook() {
  console.log(`Sending test webhook through tunnel at ${tunnelUrl}`);
  
  // Determine which payload to use
  const payload = USE_DEBUG_ROUTE ? mockMessage : mockSnsMessage;
  console.log('Payload:', JSON.stringify(payload, null, 2));
  
  try {
    const response = await axios.post(tunnelUrl, payload, {
      headers: {
        'Content-Type': 'application/json',
        'x-test-header': 'webhook-test',
        'x-amz-sns-message-type': USE_DEBUG_ROUTE ? undefined : 'Notification'
      }
    });
    
    console.log('Response status:', response.status);
    console.log('Response data:', response.data);
    console.log('✅ Test webhook sent successfully through the tunnel');
  } catch (error) {
    console.error('❌ Failed to send test webhook through tunnel:');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
      
      // Check if this is an SNS validation error and suggest using the debug route
      if (error.response.status === 400 && error.response.data?.error?.includes('signature')) {
        console.log('\n⚠️  The proxy requires valid AWS SNS signatures for the /sns endpoint');
        console.log('💡 Try one of these approaches:');
        console.log('   1. Use the debug webhook path (/debug/webhook) which bypasses signature validation');
        console.log('   2. Temporarily disable signature validation in your proxy code');
        console.log('   3. Use the AWS CLI to send a real SNS message');
      }
    } else {
      console.error(error.message);
    }
    process.exit(1);
  }
}

// Execute the test
sendTestWebhook(); 