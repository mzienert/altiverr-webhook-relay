// API endpoint to delete messages from SQS queue
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
  // Use constant-time comparison to prevent timing attacks
  return crypto.timingSafeEqual(
    Buffer.from(providedKey),
    Buffer.from(API_KEY)
  );
}

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');
  
  // Handle OPTIONS request (preflight)
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  // Only allow POST method
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Validate API key
  if (!validateApiKey(req)) {
    return res.status(401).json({ error: 'Unauthorized: Invalid API key' });
  }

  try {
    // Get receipt handle from request body
    const { receiptHandle } = req.body;
    
    if (!receiptHandle) {
      return res.status(400).json({ error: 'Missing receipt handle' });
    }

    // Set up params for deleting message
    const params = {
      QueueUrl: QUEUE_URL,
      ReceiptHandle: receiptHandle
    };

    // Delete message from SQS
    console.log('Deleting message from SQS queue...');
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