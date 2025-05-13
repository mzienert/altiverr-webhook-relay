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
const WEBHOOK_PATH = '/sns';
const PROXY_URL = `http://${PROXY_HOST}:${PROXY_PORT}${WEBHOOK_PATH}`;

// Create a mock SNS message payload
const mockSnsMessage = {
  Type: 'Notification',
  MessageId: 'test-message-' + Date.now(),
  TopicArn: process.env.SNS_TOPIC_ARN || 'arn:aws:sns:test:test:Webhooks',
  Message: JSON.stringify({
    eventType: 'TEST_EVENT',
    timestamp: new Date().toISOString(),
    data: {
      id: 'test-' + Date.now(),
      source: 'webhook-test-script',
      value: Math.random().toString(36).substring(2, 15)
    }
  }),
  Timestamp: new Date().toISOString(),
  SignatureVersion: '1',
  Signature: 'test-signature',
  SigningCertURL: 'https://example.com/cert.pem',
};

// Function to send the test webhook
async function sendTestWebhook() {
  console.log(`Sending test webhook to local proxy at ${PROXY_URL}`);
  console.log('Payload:', JSON.stringify(mockSnsMessage, null, 2));
  
  try {
    const response = await axios.post(PROXY_URL, mockSnsMessage, {
      headers: {
        'Content-Type': 'application/json',
        'x-amz-sns-message-type': 'Notification'
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
    } else {
      console.error(error.message);
    }
    process.exit(1);
  }
}

// Execute the test
sendTestWebhook(); 