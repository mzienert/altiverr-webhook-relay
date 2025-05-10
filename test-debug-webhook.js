#!/usr/bin/env node

import axios from 'axios';
import crypto from 'crypto';

// Configuration
const PROXY_URL = 'http://localhost:3333/sns';

// Generate a unique test event ID
const eventId = crypto.randomUUID();

// Create a Calendly-style payload
const calendlyPayload = {
  id: `calendly_${eventId}`,
  data: {
    metadata: {
      id: `calendly_${eventId}`,
      receivedAt: new Date().toISOString(),
      source: "calendly"
    },
    event: {
      name: "Test Calendly Event",
      type: "calendly.event_created",
      status: "active",
      start_time: new Date(Date.now() + 3600000).toISOString(),
      end_time: new Date(Date.now() + 7200000).toISOString()
    },
    invitee: {
      email: "test@example.com",
      name: "Test User",
      timezone: "America/Los_Angeles",
      uuid: crypto.randomUUID()
    }
  },
  timestamp: new Date().toISOString()
};

// Wrap the Calendly payload in an SNS-formatted message
const snsWebhookPayload = {
  Type: "Notification",
  MessageId: crypto.randomUUID(),
  TopicArn: "arn:aws:sns:us-west-1:123456789012:Webhooks",
  Subject: "Calendly Webhook Test",
  Message: JSON.stringify(calendlyPayload),
  Timestamp: new Date().toISOString(),
  SignatureVersion: "1",
  Signature: "test-signature",
  SigningCertURL: "https://sns.us-west-1.amazonaws.com/test-cert.pem",
  UnsubscribeURL: "https://sns.us-west-1.amazonaws.com/unsubscribe"
};

// Send the test webhook
async function sendTestWebhook() {
  console.log('=== Sending Test Webhook in SNS Format ===');
  console.log(`Target: ${PROXY_URL}`);
  console.log(`Event ID: ${eventId}`);
  console.log('\nCalendly Payload:');
  console.log(JSON.stringify(calendlyPayload, null, 2));
  console.log('\nSNS Wrapper:');
  console.log(JSON.stringify(snsWebhookPayload, null, 2));
  
  try {
    const response = await axios.post(PROXY_URL, snsWebhookPayload, {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'SNS-Webhook-Debug-Tester/1.0',
        'x-amz-sns-message-type': 'Notification'
      }
    });
    
    console.log('\n=== Response ===');
    console.log(`Status: ${response.status}`);
    console.log('Headers:', response.headers);
    console.log('Data:', response.data);
    console.log('\n✅ Debug webhook sent successfully');
    console.log('Check the proxy logs to verify the exact data structure being forwarded to n8n');
  } catch (error) {
    console.error('\n❌ Error sending webhook:');
    console.error(`Status: ${error.response?.status || 'Unknown'}`);
    console.error('Error:', error.message);
    
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
  }
}

// Execute the test
sendTestWebhook(); 