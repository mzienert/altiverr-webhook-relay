#!/usr/bin/env node

import axios from 'axios';
import AWS from 'aws-sdk';
import crypto from 'crypto';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { getWebhookUrl } from './src/utils/webhookUrl.js';

// Load environment variables from .env
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

// AWS Configuration
const AWS_REGION = process.env.AWS_REGION || 'us-west-1';
const SNS_TOPIC_ARN = process.env.SNS_TOPIC_ARN;

// Calendly sample event
const sampleCalendlyEvent = {
  event: 'invitee.created',
  payload: {
    cancel_url: 'https://calendly.com/cancellations/SAMPLE_CANCELLATION_TOKEN',
    created_at: new Date().toISOString(),
    email: 'test@example.com',
    name: 'Test User',
    event: {
      calendar_event: {
        external_id: 'sample_calendar_id',
        kind: 'google'
      },
      canceled: false,
      cancellation_reason: null,
      created_at: new Date().toISOString(),
      end_time: new Date(Date.now() + 3600000).toISOString(),
      event_type: {
        name: 'Test Meeting',
        slug: 'test-meeting'
      },
      invitees_counter: {
        active: 1,
        limit: 1,
        total: 1
      },
      location: {
        location: 'Zoom',
        type: 'zoom'
      },
      name: 'Test Meeting',
      start_time: new Date().toISOString(),
      status: 'active',
      uri: 'https://api.calendly.com/scheduled_events/SAMPLE_EVENT'
    },
    first_name: 'Test',
    last_name: 'User',
    questions_and_answers: [
      {
        question: 'Please share anything that will help prepare for our meeting.',
        answer: 'Testing the webhook relay system'
      }
    ],
    reschedule_url: 'https://calendly.com/reschedulings/SAMPLE_RESCHEDULE_TOKEN',
    time_zone: 'America/Los_Angeles',
    tracking: {
      utm_campaign: null,
      utm_source: null,
      utm_medium: null,
      utm_content: null,
      utm_term: null
    },
    uri: 'https://api.calendly.com/scheduled_events/SAMPLE_EVENT/invitees/SAMPLE_INVITEE'
  }
};

// Generate a unique ID for idempotency
const generateId = () => {
  return crypto.randomUUID();
};

// Normalized webhook format
const normalizedWebhook = {
  id: generateId(),
  source: 'calendly',
  timestamp: new Date().toISOString(),
  event_type: 'invitee.created',
  payload: sampleCalendlyEvent.payload
};

// Function to publish directly to SNS
async function publishToSNS() {
  try {
    console.log(`🚀 Publishing test message to SNS topic: ${SNS_TOPIC_ARN}`);
    
    // Initialize SNS client
    const sns = new AWS.SNS({ region: AWS_REGION });
    
    // Publish the message
    const result = await sns.publish({
      TopicArn: SNS_TOPIC_ARN,
      Message: JSON.stringify(normalizedWebhook),
      MessageAttributes: {
        'source': { DataType: 'String', StringValue: 'calendly' },
        'event_type': { DataType: 'String', StringValue: 'invitee.created' }
      }
    }).promise();
    
    console.log('✅ Successfully published to SNS:', { 
      messageId: result.MessageId,
      webhookId: normalizedWebhook.id
    });
    
    return result;
  } catch (error) {
    console.error('❌ Error publishing to SNS:', error.message);
    throw error;
  }
}

// Function to test the proxy directly
async function testProxyDirectly() {
  try {
    // Get the webhook URL from the utility function for consistent URL formatting
    const proxyUrl = getWebhookUrl('calendly');
    
    console.log(`🚀 Testing proxy directly at: ${proxyUrl}`);
    
    // Create a simplified webhook payload without the SNS wrapper
    const directPayload = normalizedWebhook;
    
    // Send a request directly to the webhook endpoint
    const response = await axios.post(proxyUrl, directPayload, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ Proxy response:', { 
      status: response.status, 
      data: response.data,
      webhookId: normalizedWebhook.id
    });
    
    return response.data;
  } catch (error) {
    console.error('❌ Error testing proxy directly:', error.message);
    console.error(error.response?.data || 'No response data');
    throw error;
  }
}

// Main function to run the tests
async function runTests() {
  try {
    console.log('🧪 Starting webhook relay e2e test\n');
    
    console.log('📋 Test webhook payload:', {
      id: normalizedWebhook.id,
      source: normalizedWebhook.source,
      event_type: normalizedWebhook.event_type
    });
    
    // Test mode selection
    const args = process.argv.slice(2);
    const testMode = args[0] || 'both';
    
    if (testMode === 'sns' || testMode === 'both') {
      console.log('\n📮 TEST 1: Publishing directly to SNS');
      await publishToSNS();
    }
    
    if (testMode === 'proxy' || testMode === 'both') {
      console.log('\n🔄 TEST 2: Testing proxy directly');
      await testProxyDirectly();
    }
    
    console.log('\n✅ All tests completed successfully!');
    console.log('\nCheck n8n to verify the webhook was received and processed.');
    console.log('Webhook ID for reference:', normalizedWebhook.id);
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Run the tests
runTests(); 