#!/usr/bin/env node

// Script to test the local webhook proxy by sending a test message directly
import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Setup proper paths for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Load environment variables
dotenv.config({ path: path.resolve(rootDir, '.env') });

// Configuration
const PROXY_PORT = process.env.PORT || 3333;
const PROXY_HOST = process.env.HOST || '127.0.0.1';

// IMPORTANT: Force debug route for testing!!
const USE_DEBUG_ROUTE = true; 
const DEBUG_WEBHOOK_PATH = '/debug/webhook';
const SNS_WEBHOOK_PATH = '/sns';

// Set the actual URL based on whether we're using the debug route
const TEST_URL = `http://${PROXY_HOST}:${PROXY_PORT}${DEBUG_WEBHOOK_PATH}`;

// Create a mock message payload
const mockMessage = {
  eventType: 'TEST_EVENT',
  timestamp: new Date().toISOString(),
  data: {
    id: 'test-' + Date.now(),
    source: 'webhook-test-script',
    value: Math.random().toString(36).substring(2, 15)
  }
};

// Create a mock SNS message payload (only used if USE_DEBUG_ROUTE is false)
const mockSnsMessage = {
  Type: 'Notification',
  MessageId: 'test-message-' + Date.now(),
  TopicArn: process.env.SNS_TOPIC_ARN || 'arn:aws:sns:test:test:Webhooks',
  Message: JSON.stringify(mockMessage),
  Timestamp: new Date().toISOString(),
  SignatureVersion: '1',
  Signature: 'test-signature',
  SigningCertURL: 'https://example.com/cert.pem',
};

// Function to send the test webhook
async function sendTestWebhook() {
  console.log(`Sending test webhook to local proxy at ${TEST_URL}`);
  
  // Determine which payload to use based on the endpoint
  const payload = USE_DEBUG_ROUTE ? mockMessage : mockSnsMessage;
  console.log('Payload:', JSON.stringify(payload, null, 2));
  
  try {
    const response = await axios.post(TEST_URL, payload, {
      headers: {
        'Content-Type': 'application/json',
        'x-test-header': 'webhook-test',
        // Only include SNS headers if we're using the SNS endpoint
        ...(USE_DEBUG_ROUTE ? {} : { 'x-amz-sns-message-type': 'Notification' })
      }
    });
    
    console.log('Response status:', response.status);
    console.log('Response data:', response.data);
    console.log('✅ Test webhook sent successfully');
  } catch (error) {
    console.error('❌ Failed to send test webhook:');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
      
      // Check if this is an SNS validation error and suggest using the debug route
      if (error.response.status === 400 && error.response.data?.error?.includes('signature')) {
        console.log('\n⚠️  The proxy requires valid AWS SNS signatures for the /sns endpoint');
        console.log('💡 Try one of these approaches:');
        console.log('   1. Add a /debug/webhook endpoint to your proxy for testing');
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