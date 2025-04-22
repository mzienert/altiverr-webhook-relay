// A minimal test script for directly sending a message to SQS
// Run with: node test-sqs-direct.js
require('dotenv').config();
const AWS = require('aws-sdk');
const crypto = require('crypto');

// Enable AWS SDK logging
AWS.config.logger = console;

// Initialize SQS with minimal configuration
const sqs = new AWS.SQS({
  region: process.env.AWS_REGION,
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

const QUEUE_URL = process.env.SQS_QUEUE_URL;

async function sendTestMessage() {
  try {
    console.log('Environment variables loaded:', {
      hasRegion: !!process.env.AWS_REGION,
      hasAccessKey: !!process.env.AWS_ACCESS_KEY_ID,
      hasSecretKey: !!process.env.AWS_SECRET_ACCESS_KEY,
      hasQueueUrl: !!process.env.SQS_QUEUE_URL,
      region: process.env.AWS_REGION,
      queueUrl: process.env.SQS_QUEUE_URL
    });
    
    // Generate a unique deduplication ID
    const deduplicationId = crypto
      .createHash('sha256')
      .update(`test-${Date.now()}`)
      .digest('hex');
    
    // Create a simple test message
    const messageBody = JSON.stringify({
      event: "test-event",
      time: new Date().toISOString(),
      payload: {
        message: "Test message from direct script"
      }
    });
    
    // Strictly define SQS parameters
    const params = {
      QueueUrl: QUEUE_URL,
      MessageBody: messageBody,
      MessageGroupId: "test-group",
      MessageDeduplicationId: deduplicationId
    };
    
    console.log('SQS Parameters:', JSON.stringify(params, null, 2));
    
    // Send the message
    console.log('Sending test message to SQS...');
    const result = await sqs.sendMessage(params).promise();
    console.log('Successfully sent message to SQS:', result);
    
    return {success: true, messageId: result.MessageId};
  } catch (error) {
    console.error('Failed to send message to SQS:', error);
    return {success: false, error: error.message};
  }
}

// Run the test
sendTestMessage()
  .then(result => {
    console.log('Test result:', result);
    if (result.success) {
      console.log('✅ Test passed!');
    } else {
      console.log('❌ Test failed!');
    }
  })
  .catch(error => {
    console.error('Unhandled error:', error);
  }); 