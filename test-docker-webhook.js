#!/usr/bin/env node

import axios from 'axios';
import crypto from 'crypto';

// Configuration
const PROXY_URL = 'http://localhost:3333/api/webhook/calendly';

// Generate a unique test event ID
const eventId = crypto.randomUUID();

// Create a test webhook payload similar to Calendly
const webhookPayload = {
  event: 'calendly.event_created',
  created_at: new Date().toISOString(),
  payload: {
    event: {
      uri: `https://api.calendly.com/scheduled_events/${eventId}`,
      name: 'Test Docker Connection',
      status: 'active',
      start_time: new Date(Date.now() + 3600000).toISOString(),
      end_time: new Date(Date.now() + 7200000).toISOString(),
      event_type: 'meeting'
    },
    invitee: {
      email: 'test@example.com',
      name: 'Test User',
      timezone: 'America/Los_Angeles',
      uuid: crypto.randomUUID()
    }
  },
  metadata: {
    id: eventId,
    test: true,
    timestamp: new Date().toISOString()
  }
};

// Send the test webhook
async function sendTestWebhook() {
  console.log('=== Sending Test Webhook ===');
  console.log(`Target: ${PROXY_URL}`);
  console.log(`Event ID: ${eventId}`);
  
  try {
    const response = await axios.post(PROXY_URL, webhookPayload, {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Calendly-Webhook-Tester/1.0',
        'X-Test-Webhook': 'true'
      }
    });
    
    console.log('\n=== Response ===');
    console.log(`Status: ${response.status}`);
    console.log('Headers:', response.headers);
    console.log('Data:', response.data);
    console.log('\n✅ Webhook sent successfully');
    console.log('Check the proxy logs to verify forwarding to n8n Docker container');
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