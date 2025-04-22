require('dotenv').config();
const crypto = require('crypto');
const axios = require('axios');

// Get the environment variables
const SIGNING_KEY = process.env.CALENDLY_WEBHOOK_SIGNING_KEY;
const WEBHOOK_URL = process.env.CALENDLY_WEBHOOK_URL;

// For test purposes
const timestamp = new Date().toISOString();
const payload = {
  event: 'invitee.created',
  time: timestamp,
  payload: {
    event_type: 'TEST',
    event: {
      uuid: `test-event-${Date.now()}`,
      name: 'Test Event'
    },
    invitee: {
      uuid: `test-invitee-${Date.now()}`,
      email: 'test@example.com',
      name: 'Test User'
    }
  }
};

// Stringify the payload exactly once
const stringifiedPayload = JSON.stringify(payload);

// Create the signature in the exact same way as the webhook handler
const signaturePayload = `${timestamp}.${stringifiedPayload}`;
const signature = crypto
  .createHmac('sha256', SIGNING_KEY)
  .update(signaturePayload)
  .digest('hex');

// Debug information
console.log('=== Test Signature Details ===');
console.log('Timestamp:', timestamp);
console.log('Signing Key (first 6 chars):', SIGNING_KEY.substring(0, 6) + '...');
console.log('Stringified Payload:', stringifiedPayload);
console.log('Signature Payload:', signaturePayload);
console.log('Generated Signature:', signature);
console.log('=============================');

// Send the request
async function sendRequest() {
  try {
    console.log(`Sending request to: ${WEBHOOK_URL}`);
    
    const response = await axios.post(WEBHOOK_URL, payload, {
      headers: {
        'Content-Type': 'application/json',
        'x-calendly-signature': signature,
        'x-calendly-timestamp': timestamp
      }
    });
    
    console.log('Response:', response.status, response.data);
  } catch (error) {
    console.error('Error:', error.response ? error.response.data : error.message);
  }
}

sendRequest(); 