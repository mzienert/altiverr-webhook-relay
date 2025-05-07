// API endpoint to retrieve messages from SQS queue
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

export default async function handler(req, res) {
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
    // Get query parameters
    const maxMessages = Math.min(parseInt(req.query.max || '100'), 10); // Max 10 messages
    const visibilityTimeout = parseInt(req.query.visibility || '10'); // Default 30 seconds
    const waitTimeSeconds = parseInt(req.query.wait || '0'); // Default 0 seconds (short polling)
    const includeAttributes = req.query.attributes === 'true'; // Include all attributes
    const allStats = req.query.stats === 'true'; // Include queue stats

    // Set up params for receiving messages
    const params = {
      QueueUrl: QUEUE_URL,
      MaxNumberOfMessages: maxMessages,
      VisibilityTimeout: visibilityTimeout,
      WaitTimeSeconds: waitTimeSeconds
    };

    // If attributes are requested, include them
    if (includeAttributes) {
      params.AttributeNames = ['All'];
      params.MessageAttributeNames = ['All'];
    }

    // If stats are requested, get the queue attributes first
    let queueStats = {};
    if (allStats) {
      try {
        const attributeParams = {
          QueueUrl: QUEUE_URL,
          AttributeNames: ['All']
        };
        
        const attributeData = await sqs.getQueueAttributes(attributeParams).promise();
        queueStats = attributeData.Attributes || {};
      } catch (err) {
        console.error('Error getting queue attributes:', err);
      }
    }

    // Get messages from SQS
    console.log('Retrieving messages from SQS queue...');
    const data = await sqs.receiveMessage(params).promise();
    
    // Check if messages were found
    if (!data.Messages || data.Messages.length === 0) {
      return res.status(200).json({ 
        messages: [],
        count: 0,
        stats: queueStats
      });
    }

    // Process messages
    const messages = data.Messages.map(message => {
      let body;
      
      try {
        // Parse the message body (which is a JSON string)
        body = JSON.parse(message.Body);
      } catch (err) {
        // If we can't parse the message body, use it as is
        body = message.Body;
      }
      
      // Basic message properties
      const result = {
        id: message.MessageId,
        receiptHandle: message.ReceiptHandle,
        body: body,
        md5OfBody: message.MD5OfBody
      };
      
      // Add attributes if requested
      if (includeAttributes) {
        result.attributes = message.Attributes || {};
        result.messageAttributes = message.MessageAttributes || {};
      }
      
      return result;
    });

    return res.status(200).json({
      messages: messages,
      count: messages.length,
      stats: queueStats
    });
  } catch (error) {
    console.error('Error retrieving messages from SQS:', error);
    return res.status(500).json({
      error: 'Failed to retrieve messages from queue',
      details: error.message
    });
  }
} 