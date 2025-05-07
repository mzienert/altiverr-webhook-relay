// API endpoint to retrieve Slack messages from SQS queue
const AWS = require('aws-sdk');
const crypto = require('crypto');

// Initialize SQS
const sqs = new AWS.SQS({
  region: process.env.AWS_REGION
});

// Environment variables
const QUEUE_URL = process.env.SLACK_SQS_QUEUE_URL;
const API_KEY = process.env.QUEUE_API_KEY || process.env.SLACK_QUEUE_API_KEY || 'default-key-replace-me';

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

  // Check if queue URL is configured
  if (!QUEUE_URL) {
    return res.status(503).json({
      error: 'Queue not configured',
      details: 'SLACK_SQS_QUEUE_URL environment variable is not set'
    });
  }

  try {
    // Get query parameters
    const maxMessages = Math.min(parseInt(req.query.max || '5'), 10); // Max 10 messages
    const visibilityTimeout = parseInt(req.query.visibility || '30'); // Default 30 seconds
    const waitTimeSeconds = parseInt(req.query.wait || '0'); // Default 0 seconds (short polling)
    const includeAttributes = req.query.attributes === 'true'; // Include all attributes
    const deleteMessages = req.query.delete === 'true'; // Whether to delete messages after receiving
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
    console.log('Retrieving Slack messages from SQS queue...');
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

    // If deleteMessages flag is set, delete the messages from the queue
    if (deleteMessages && data.Messages.length > 0) {
      const deletePromises = data.Messages.map(message => {
        const deleteParams = {
          QueueUrl: QUEUE_URL,
          ReceiptHandle: message.ReceiptHandle
        };
        return sqs.deleteMessage(deleteParams).promise();
      });
      
      try {
        await Promise.all(deletePromises);
        console.log(`Deleted ${deletePromises.length} messages from Slack queue`);
      } catch (deleteError) {
        console.error('Error deleting messages:', deleteError);
      }
    }

    return res.status(200).json({
      messages: messages,
      count: messages.length,
      stats: queueStats
    });
  } catch (error) {
    console.error('Error retrieving Slack messages from SQS:', error);
    return res.status(500).json({
      error: 'Failed to retrieve messages from queue',
      details: error.message
    });
  }
} 