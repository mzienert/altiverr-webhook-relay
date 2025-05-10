#!/usr/bin/env node

import axios from 'axios';
import crypto from 'crypto';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { getWebhookUrl } from './src/utils/webhookUrl.js';

// Load environment variables from .env
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

// Get the appropriate webhook URL based on environment
const N8N_WEBHOOK_URL = getWebhookUrl();

// Generate a unique ID for idempotency
const generateId = () => {
  return crypto.randomUUID();
};

// Calendly sample event with a single invitee
const sampleWebhook = {
  id: generateId(),
  source: 'calendly',
  timestamp: new Date().toISOString(),
  event_type: 'invitee.created',
  payload: {
    event: 'invitee.created',
    created_at: new Date().toISOString(),
    email: 'test@example.com',
    name: 'Test User',
    first_name: 'Test',
    last_name: 'User',
    event: {
      name: 'Test Meeting',
      start_time: new Date().toISOString(),
      end_time: new Date(Date.now() + 3600000).toISOString(),
    },
    questions_and_answers: [
      {
        question: 'Please share anything that will help prepare for our meeting.',
        answer: 'Testing the webhook relay system'
      }
    ],
    time_zone: 'America/Los_Angeles'
  }
};

// Main function to test direct n8n posting
async function testDirectN8n() {
  try {
    console.log('🧪 Starting direct n8n webhook test\n');
    
    console.log('📋 Test webhook payload:', {
      id: sampleWebhook.id,
      source: sampleWebhook.source,
      event_type: sampleWebhook.event_type
    });
    
    console.log(`🚀 Posting directly to n8n: ${N8N_WEBHOOK_URL}`);
    
    // Send the webhook directly to n8n
    const response = await axios.post(N8N_WEBHOOK_URL, sampleWebhook, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ n8n response:', { 
      status: response.status, 
      data: response.data,
      webhookId: sampleWebhook.id
    });
    
    console.log('\n✅ Test completed successfully!');
    console.log('\nCheck n8n to verify the webhook was received and processed.');
    console.log('Webhook ID for reference:', sampleWebhook.id);
    
    return response.data;
  } catch (error) {
    console.error('❌ Error posting to n8n:', error.message);
    console.error(error.response?.data || 'No response data');
    process.exit(1);
  }
}

// Run the test
testDirectN8n(); 