#!/usr/bin/env node

import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

// Configuration
const API_URL = process.env.API_URL || 'http://localhost:8080/api/webhook/calendly';

// Create a sample Calendly webhook payload
const samplePayload = {
  event: 'invitee.created',
  created_at: new Date().toISOString(),
  payload: {
    event_type: {
      uuid: uuidv4(),
      name: 'Sample Meeting'
    },
    event: {
      uuid: uuidv4(),
      start_time: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
      end_time: new Date(Date.now() + 90000000).toISOString(),
      location: {
        type: 'zoom',
        join_url: 'https://zoom.us/j/sample'
      }
    },
    invitee: {
      uuid: uuidv4(),
      name: 'Test User',
      email: 'test@example.com',
      text_reminder_number: '',
      timezone: 'America/Los_Angeles'
    },
    questions_and_answers: [],
    tracking: {
      utm_source: 'test',
      utm_medium: 'script'
    },
    cancel_url: 'https://calendly.com/cancellations/sample'
  }
};

// Send the webhook to the API
async function sendWebhook() {
  try {
    console.log(`Sending test webhook to ${API_URL}...`);
    
    const response = await axios.post(API_URL, samplePayload, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log('Webhook sent successfully!');
    console.log('Response:', JSON.stringify(response.data, null, 2));
    
    return response.data;
  } catch (error) {
    console.error('Error sending webhook:');
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error('Response:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.error(error.message);
    }
    process.exit(1);
  }
}

// Execute the test
sendWebhook(); 