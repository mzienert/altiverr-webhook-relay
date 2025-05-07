#!/usr/bin/env node
// Script to poll SQS queue and forward Slack webhook events to a local n8n instance
const AWS = require('aws-sdk');
const fetch = require('node-fetch');
const http = require('http');
const https = require('https');
const crypto = require('crypto');

// Configure AWS SDK
AWS.config.update({
  region: process.env.AWS_REGION || 'us-east-1'
});

// Create SQS service object
const sqs = new AWS.SQS({ apiVersion: '2012-11-05' });

// Configuration
const QUEUE_URL = process.env.SQS_QUEUE_URL;
const LOCAL_N8N_BASE_URL = process.env.LOCAL_N8N_URL || 'http://localhost:5678';
const POLLING_INTERVAL = parseInt(process.env.POLLING_INTERVAL || '10', 10); // seconds
const MAX_MESSAGES = parseInt(process.env.MAX_MESSAGES || '10', 10);
const VISIBILITY_TIMEOUT = parseInt(process.env.VISIBILITY_TIMEOUT || '30', 10); // seconds
const WAIT_TIME = parseInt(process.env.WAIT_TIME || '20', 10); // seconds (long polling)
const API_KEY = process.env.QUEUE_API_KEY;

// Create HTTP agents with keepalive
const httpAgent = new http.Agent({ keepAlive: true });
const httpsAgent = new https.Agent({ keepAlive: true });

// Log configuration
console.log('Slack Webhook Consumer - Configuration:');
console.log(`  Queue URL: ${QUEUE_URL}`);
console.log(`  Local n8n URL: ${LOCAL_N8N_BASE_URL}`);
console.log(`  Polling Interval: ${POLLING_INTERVAL}s`);
console.log(`  Max Messages: ${MAX_MESSAGES}`);
console.log(`  Visibility Timeout: ${VISIBILITY_TIMEOUT}s`);
console.log(`  Wait Time: ${WAIT_TIME}s`);
console.log(`  API Key Configured: ${API_KEY ? 'Yes' : 'No'}`);

// Function to receive messages from SQS
async function receiveMessages() {
  const params = {
    QueueUrl: QUEUE_URL,
    MaxNumberOfMessages: MAX_MESSAGES,
    VisibilityTimeout: VISIBILITY_TIMEOUT,
    WaitTimeSeconds: WAIT_TIME,
    MessageAttributeNames: ['All']
  };

  try {
    const data = await sqs.receiveMessage(params).promise();
    if (data.Messages && data.Messages.length > 0) {
      console.log(`Received ${data.Messages.length} message(s)`);
      return data.Messages;
    }
    return [];
  } catch (err) {
    console.error('Error receiving messages:', err);
    return [];
  }
}

// Function to delete a message from the queue
async function deleteMessage(receiptHandle) {
  const params = {
    QueueUrl: QUEUE_URL,
    ReceiptHandle: receiptHandle
  };

  try {
    await sqs.deleteMessage(params).promise();
    return true;
  } catch (err) {
    console.error('Error deleting message:', err);
    return false;
  }
}

// Function to forward the message to local n8n
async function forwardToN8n(message) {
  try {
    // Parse the message body
    const messageData = JSON.parse(message.Body);
    
    // Only process messages from Slack
    if (messageData.source !== 'slack') {
      console.log('Skipping non-Slack message');
      return false;
    }
    
    // Extract the webhook ID and payload
    const webhookId = messageData.webhookId;
    const headers = messageData.headers || {};
    const payload = messageData.payload;
    
    // Construct the webhook URL
    const webhookUrl = `${LOCAL_N8N_BASE_URL}/webhook/${webhookId}`;
    
    console.log(`Forwarding webhook to: ${webhookUrl}`);
    
    // Send the webhook to n8n
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers
      },
      body: JSON.stringify(payload),
      agent: webhookUrl.startsWith('https') ? httpsAgent : httpAgent,
      timeout: 10000 // 10 second timeout
    });
    
    const responseText = await response.text();
    console.log(`n8n response (${response.status}): ${responseText.substring(0, 100)}${responseText.length > 100 ? '...' : ''}`);
    
    // Consider any 2xx status code as success
    return response.status >= 200 && response.status < 300;
  } catch (err) {
    console.error('Error forwarding to n8n:', err);
    return false;
  }
}

// Main polling function
async function pollQueue() {
  console.log('Polling for messages...');
  const messages = await receiveMessages();
  
  if (messages.length === 0) {
    console.log('No messages received');
    return;
  }
  
  // Process each message
  for (const message of messages) {
    console.log(`Processing message: ${message.MessageId}`);
    
    try {
      // Forward the message to n8n
      const forwardSuccess = await forwardToN8n(message);
      
      // If successful, delete the message from the queue
      if (forwardSuccess) {
        console.log(`Successfully processed message: ${message.MessageId}`);
        await deleteMessage(message.ReceiptHandle);
        console.log(`Deleted message: ${message.MessageId}`);
      } else {
        console.log(`Failed to process message: ${message.MessageId}, keeping in queue`);
      }
    } catch (err) {
      console.error(`Error processing message ${message.MessageId}:`, err);
    }
  }
}

// Start the polling process
async function startPolling() {
  console.log('Starting Slack webhook consumer...');
  
  // Validate configuration
  if (!QUEUE_URL) {
    console.error('Error: SQS_QUEUE_URL is not configured');
    process.exit(1);
  }
  
  // Initial poll
  await pollQueue();
  
  // Set up recurring polling
  setInterval(pollQueue, POLLING_INTERVAL * 1000);
  
  console.log(`Polling every ${POLLING_INTERVAL} seconds...`);
}

// Start the consumer
startPolling().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
}); 