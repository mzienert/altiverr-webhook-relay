#!/usr/bin/env node
// Test script for SQS connectivity
require('dotenv').config();
const AWS = require('aws-sdk');
const crypto = require('crypto');

// Enable AWS SDK debugging
AWS.config.logger = console;

// Init SQS with debugging
console.log('Initializing SQS with settings:', {
  region: process.env.AWS_REGION,
  accessKeyId: process.env.AWS_ACCESS_KEY_ID ? process.env.AWS_ACCESS_KEY_ID.substring(0, 5) + '...' : 'not set',
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ? 'set (hidden)' : 'not set',
  endpoint: process.env.AWS_ENDPOINT || 'default AWS endpoint'
});

const sqs = new AWS.SQS({
  region: process.env.AWS_REGION,
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  endpoint: process.env.AWS_ENDPOINT,
  httpOptions: {
    timeout: 5000,
    connectTimeout: 1000
  }
});

// Queue URL
const QUEUE_URL = process.env.SLACK_SQS_QUEUE_URL;
console.log('Using queue URL:', QUEUE_URL);

// Generate unique IDs for FIFO queue
const deduplicationId = crypto
  .createHash('sha256')
  .update(`test-${Date.now()}`)
  .digest('hex');

// Create simple message
const messageBody = JSON.stringify({
  source: 'test-script',
  timestamp: new Date().toISOString(),
  test: true
});

// Prepare message parameters
const messageParams = {
  QueueUrl: QUEUE_URL,
  MessageBody: messageBody,
  MessageGroupId: 'test-group',
  MessageDeduplicationId: deduplicationId
};

console.log('Sending test message to SQS:', {
  messageGroupId: messageParams.MessageGroupId,
  deduplicationId: messageParams.MessageDeduplicationId,
  bodyLength: messageBody.length
});

// Time the operation
const startTime = Date.now();

// Send message
sqs.sendMessage(messageParams)
  .promise()
  .then(result => {
    const duration = Date.now() - startTime;
    console.log(`Successfully sent message in ${duration}ms:`, {
      messageId: result.MessageId,
      sequenceNumber: result.SequenceNumber
    });
    
    // Now try to receive the message
    console.log('Trying to receive the message...');
    return sqs.receiveMessage({
      QueueUrl: QUEUE_URL,
      MaxNumberOfMessages: 1,
      WaitTimeSeconds: 1
    }).promise();
  })
  .then(data => {
    if (data.Messages && data.Messages.length > 0) {
      console.log('Successfully received message:', {
        messageId: data.Messages[0].MessageId,
        body: data.Messages[0].Body
      });
      
      // Delete the message
      return sqs.deleteMessage({
        QueueUrl: QUEUE_URL,
        ReceiptHandle: data.Messages[0].ReceiptHandle
      }).promise()
        .then(() => console.log('Message deleted successfully'));
    } else {
      console.log('No messages found in queue');
    }
  })
  .catch(error => {
    const duration = Date.now() - startTime;
    console.error(`SQS operation failed after ${duration}ms:`, {
      message: error.message,
      code: error.code,
      statusCode: error.statusCode,
      requestId: error.requestId,
      stack: error.stack
    });
  }); 