// API endpoint to delete a specific message from the Slack SQS queue
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
  res.setHeader('Access-Control-Allow-Methods', 'POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');
  
  // Handle OPTIONS request (preflight)
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  // Only allow POST and DELETE methods
  if (req.method !== 'POST' && req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed. Use POST or DELETE' });
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
    // Get receipt handle from query or body
    let receiptHandle;
    
    if (req.method === 'DELETE') {
      // For DELETE, get from query params
      receiptHandle = req.query.receiptHandle;
    } else {
      // For POST, get from body
      receiptHandle = req.body.receiptHandle;
    }
    
    // Validate receipt handle
    if (!receiptHandle) {
      return res.status(400).json({ 
        error: 'Missing receipt handle',
        details: 'A valid receipt handle is required to delete a message'
      });
    }

    // Delete the message
    const params = {
      QueueUrl: QUEUE_URL,
      ReceiptHandle: receiptHandle
    };
    
    console.log(`Deleting message with receipt handle: ${receiptHandle.substring(0, 20)}...`);
    
    await sqs.deleteMessage(params).promise();
    
    return res.status(200).json({
      success: true,
      message: 'Message deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting message from SQS:', error);
    return res.status(500).json({
      error: 'Failed to delete message from queue',
      details: error.message
    });
  }
} 