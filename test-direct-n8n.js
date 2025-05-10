#!/usr/bin/env node

import axios from 'axios';
import crypto from 'crypto';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables from .env
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

// Determine environment
const NODE_ENV = process.env.NODE_ENV || 'development';

// N8N Webhook URL - different URLs for different environments
let N8N_WEBHOOK_URL;
if (NODE_ENV === 'production') {
  N8N_WEBHOOK_URL = 'http://localhost:5678/webhook/calendly'; // Production endpoint
} else {
  N8N_WEBHOOK_URL = 'http://localhost:5678/webhook-test/calendly'; // Test/development endpoint
}

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
  test_flag: 'THIS_IS_A_TEST_WEBHOOK_PLEASE_CONFIRM_RECEIPT', // Add this visible test flag
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