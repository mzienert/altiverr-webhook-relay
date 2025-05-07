// API to delete a message from SQS
const AWS = require('aws-sdk');

// Initialize SQS
const sqs = new AWS.SQS({
  region: process.env.AWS_REGION
});

// Environment variables
const QUEUE_URL = process.env.SQS_QUEUE_URL;
const API_KEY = process.env.QUEUE_API_KEY || 'default-key-replace-me';

module.exports = async function handler(req, res) {
  // Check API key
  const apiKey = req.headers['x-api-key'];
  if (apiKey !== API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Only allow POST method
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get the receipt handle from the request body
    const { receiptHandle } = req.body;
    
    if (!receiptHandle) {
      return res.status(400).json({ error: 'Receipt handle is required' });
    }
    
    // Delete the message from SQS
    const params = {
      QueueUrl: QUEUE_URL,
      ReceiptHandle: receiptHandle
    };
    
    const result = await sqs.deleteMessage(params).promise();
    
    return res.status(200).json({ 
      success: true,
      message: 'Message deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting message:', error);
    
    return res.status(500).json({ 
      error: 'Failed to delete message',
      details: error.message
    });
  }
} 