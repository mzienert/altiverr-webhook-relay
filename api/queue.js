// Queue management API for SQS
const AWS = require('aws-sdk');
const crypto = require('crypto');

// Initialize SQS
const sqs = new AWS.SQS({
  region: process.env.AWS_REGION
});

// Environment variables
const QUEUE_URL = process.env.SQS_QUEUE_URL;
const API_KEY = process.env.QUEUE_API_KEY || 'default-key-replace-me';

// Validate API key middleware
function validateApiKey(req) {
  const providedKey = req.headers['x-api-key'];
  if (!providedKey) {
    return false;
  }
  
  try {
    // Use constant-time comparison to prevent timing attacks
    return crypto.timingSafeEqual(
      Buffer.from(providedKey),
      Buffer.from(API_KEY)
    );
  } catch (error) {
    console.error('API key validation error:', error);
    return false;
  }
}

// API handler
module.exports = async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');
  
  // Handle OPTIONS request (preflight)
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  // Only allow GET method
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Validate API key
  if (!validateApiKey(req)) {
    return res.status(401).json({ error: 'Unauthorized: Invalid API key' });
  }

  try {
    // Get messages with pagination support
    const max = Math.min(parseInt(req.query.max) || 10, 10);
    const visibilityTimeout = parseInt(req.query.visibility) || 30;
    const waitTime = parseInt(req.query.wait) || 0;
    const includeAttributes = req.query.attributes === 'true';
    const includeStats = req.query.stats === 'true';
    
    // Prepare SQS parameters
    const params = {
      QueueUrl: QUEUE_URL,
      MaxNumberOfMessages: max,
      VisibilityTimeout: visibilityTimeout,
      WaitTimeSeconds: waitTime,
      AttributeNames: includeAttributes ? ['All'] : []
    };
    
    // Receive messages from SQS
    const data = await sqs.receiveMessage(params).promise();
    
    // Return empty array if no messages
    const messages = data.Messages || [];
    
    // Get queue stats if requested
    let stats = null;
    if (includeStats) {
      const statsParams = {
        QueueUrl: QUEUE_URL,
        AttributeNames: ['All']
      };
      
      const queueData = await sqs.getQueueAttributes(statsParams).promise();
      stats = queueData.Attributes;
    }
    
    // Prepare response
    const response = {
      totalMessages: messages.length,
      messages: messages.map(message => {
        const body = JSON.parse(message.Body);
        return {
          messageId: message.MessageId,
          receiptHandle: message.ReceiptHandle,
          body: body,
          attributes: includeAttributes ? message.Attributes : undefined
        };
      })
    };
    
    // Add stats if requested
    if (stats) {
      response.stats = stats;
    }
    
    return res.status(200).json(response);
  } catch (error) {
    console.error('Queue error:', error);
    return res.status(500).json({ 
      error: 'Failed to retrieve messages',
      details: error.message
    });
  }
} 