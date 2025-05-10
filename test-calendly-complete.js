#!/usr/bin/env node

import axios from 'axios';
import crypto from 'crypto';

// Configuration
const PROXY_URL = 'http://localhost:3333/sns';

// Generate a unique test event ID
const eventId = crypto.randomUUID();

// Create a complete Calendly-style payload based on the provided data
const calendlyPayload = {
  id: `calendly_${eventId}`,
  data: {
    metadata: {
      id: `calendly_${eventId}`,
      receivedAt: new Date().toISOString(),
      source: "calendly"
    },
    event: {
      name: "Calendly Appointment",
      type: "calendly.event_scheduled",
      status: "active",
      start_time: new Date(Date.now() + 3600000).toISOString(),
      end_time: new Date(Date.now() + 7200000).toISOString()
    },
    invitee: {
      email: "test@example.com",
      name: "Test User",
      timezone: "America/Denver",
      text_reminder_number: null,
      tracking: {
        utm_campaign: "cta_click",
        utm_source: "header-top-right",
        utm_medium: "website",
        utm_content: null,
        utm_term: null,
        salesforce_uuid: null
      },
      updated_at: new Date().toISOString(),
      uri: `https://api.calendly.com/scheduled_events/760df656-e0dd-43a7-954a-77865a87d133/invitees/${crypto.randomUUID()}`
    },
    event: "https://api.calendly.com/scheduled_events/760df656-e0dd-43a7-954a-77865a87d133",
    invitee: null,
    tracking: {
      utm_campaign: "cta_click",
      utm_source: "header-top-right",
      utm_medium: "website",
      utm_content: null,
      utm_term: null,
      salesforce_uuid: null
    }
  },
  timestamp: new Date().toISOString(),
  webhookUrl: "http://localhost:5678/webhook/calendly",
  executionMode: "production"
};

// Wrap the Calendly payload in an SNS-formatted message
const snsWebhookPayload = {
  Type: "Notification",
  MessageId: crypto.randomUUID(),
  TopicArn: "arn:aws:sns:us-west-1:123456789012:Webhooks",
  Subject: "Calendly Appointment Scheduled",
  Message: JSON.stringify(calendlyPayload),
  Timestamp: new Date().toISOString(),
  SignatureVersion: "1",
  Signature: "test-signature",
  SigningCertURL: "https://sns.us-west-1.amazonaws.com/test-cert.pem",
  UnsubscribeURL: "https://sns.us-west-1.amazonaws.com/unsubscribe"
};

// Send the test webhook
async function sendTestWebhook() {
  console.log('=== Sending Complete Calendly Test Webhook in SNS Format ===');
  console.log(`Target: ${PROXY_URL}`);
  console.log(`Event ID: ${eventId}`);
  console.log('\nCalendly Payload Sample:');
  console.log(JSON.stringify(calendlyPayload, null, 2).substring(0, 500) + '...');
  
  try {
    const response = await axios.post(PROXY_URL, snsWebhookPayload, {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'SNS-Webhook-Calendly-Tester/1.0',
        'x-amz-sns-message-type': 'Notification'
      }
    });
    
    console.log('\n=== Response ===');
    console.log(`Status: ${response.status}`);
    console.log('Data:', response.data);
    console.log('\n✅ Complete Calendly test webhook sent successfully');
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