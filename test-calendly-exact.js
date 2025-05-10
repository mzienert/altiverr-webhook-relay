#!/usr/bin/env node

import axios from 'axios';
import crypto from 'crypto';

// Configuration
const PROXY_URL = 'http://localhost:3333/sns';

// Generate a unique test event ID
const eventId = crypto.randomUUID();
const scheduledEventId = "4b2b9d3f-c718-4a12-bbde-c83b4cb6f39e";
const inviteeId = "855023a2-98de-49b9-a7dc-5788e888ab8a";

// Create a Calendly-style payload exactly matching the provided structure
const calendlyPayload = {
  id: `calendly_${eventId}`,
  data: {
    metadata: {
      id: `calendly_${eventId}`,
      receivedAt: new Date().toISOString(),
      source: "calendly"
    },
    invitee: {
      text_reminder_number: null,
      timezone: "America/Denver",
      tracking: {
        utm_campaign: "cta_click",
        utm_source: "header-top-right",
        utm_medium: "website",
        utm_content: null,
        utm_term: null,
        salesforce_uuid: null
      },
      updated_at: new Date().toISOString(),
      uri: `https://api.calendly.com/scheduled_events/${scheduledEventId}/invitees/${inviteeId}`
    },
    event: `https://api.calendly.com/scheduled_events/${scheduledEventId}`,
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
  console.log('=== Sending Exact Calendly Test Webhook in SNS Format ===');
  console.log(`Target: ${PROXY_URL}`);
  console.log(`Event ID: ${eventId}`);
  console.log(`Scheduled Event ID: ${scheduledEventId}`);
  console.log(`Invitee ID: ${inviteeId}`);
  
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
    console.log('\n✅ Exact format webhook sent successfully');
    console.log('Key mappings for Slack:');
    console.log('- Event URI: calendlyPayload.data.event');
    console.log('- Timezone: calendlyPayload.data.invitee.timezone');
    console.log('- UTM Campaign: calendlyPayload.data.tracking.utm_campaign');
    console.log('- UTM Source: calendlyPayload.data.tracking.utm_source');
    console.log('- UTM Medium: calendlyPayload.data.tracking.utm_medium');
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