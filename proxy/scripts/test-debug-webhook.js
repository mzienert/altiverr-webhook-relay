#!/usr/bin/env node

// Simple script to test the debug webhook endpoint
import axios from 'axios';

// Configuration
const PROXY_PORT = 3333;
const PROXY_HOST = '127.0.0.1';
const DEBUG_WEBHOOK_PATH = '/debug/webhook';
const TEST_URL = `http://${PROXY_HOST}:${PROXY_PORT}${DEBUG_WEBHOOK_PATH}`;

// Create a simple test payload
const testPayload = {
  eventType: 'DEBUG_TEST_EVENT',
  timestamp: new Date().toISOString(),
  data: {
    id: 'debug-test-' + Date.now(),
    source: 'direct-webhook-test-script',
    value: Math.random().toString(36).substring(2, 15)
  }
};

// Function to send the test webhook
async function sendTestWebhook() {
  console.log(`Sending test webhook to debug endpoint at ${TEST_URL}`);
  console.log('Payload:', JSON.stringify(testPayload, null, 2));
  
  try {
    const response = await axios.post(TEST_URL, testPayload, {
      headers: {
        'Content-Type': 'application/json',
        'x-test-header': 'debug-webhook-test'
      }
    });
    
    console.log('Response status:', response.status);
    console.log('Response data:', response.data);
    console.log('✅ Test webhook sent successfully to debug endpoint');
  } catch (error) {
    console.error('❌ Failed to send test webhook:');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    } else {
      console.error(error.message);
    }
    process.exit(1);
  }
}

// Execute the test
sendTestWebhook();
