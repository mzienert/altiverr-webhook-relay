// Debug webhook handler specifically targeting the Id parameter issue
const AWS = require('aws-sdk');
const crypto = require('crypto');
const util = require('util');

// Get signing key
const CALENDLY_WEBHOOK_SIGNING_KEY = process.env.CALENDLY_WEBHOOK_SIGNING_KEY;

// Verify Calendly signature
function verifySignature(payload, signature, timestamp) {
  try {
    const signaturePayload = `${timestamp}.${payload}`;
    const expectedSignature = crypto
      .createHmac('sha256', CALENDLY_WEBHOOK_SIGNING_KEY)
      .update(signaturePayload)
      .digest('hex');
    
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch (err) {
    console.error('Signature verification error:', err);
    return false;
  }
}

// Helper function to deeply inspect an object for Id properties
function findIdProperties(obj, path = '') {
  const results = [];
  
  if (obj === null || typeof obj !== 'object') {
    return results;
  }
  
  // Check all properties
  Object.keys(obj).forEach(key => {
    const currentPath = path ? `${path}.${key}` : key;
    
    // Check if this key is 'Id'
    if (key === 'Id' || key === 'id') {
      results.push({
        path: currentPath,
        value: obj[key]
      });
    }
    
    // Recursively check nested objects
    if (obj[key] !== null && typeof obj[key] === 'object') {
      results.push(...findIdProperties(obj[key], currentPath));
    }
  });
  
  return results;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('Debug webhook handler called');
    
    // Verify signature
    const signature = req.headers['x-calendly-signature'];
    const timestamp = req.headers['x-calendly-timestamp'];
    
    if (!signature || !timestamp) {
      return res.status(401).json({ error: 'Missing signature headers' });
    }

    const rawBody = JSON.stringify(req.body);
    if (!verifySignature(rawBody, signature, timestamp)) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    console.log('Input body:', util.inspect(req.body, { depth: 10 }));
    
    // Generate unique deduplication ID
    const deduplicationId = crypto
      .createHash('sha256')
      .update(`debug-${Date.now()}`)
      .digest('hex');

    // First, let's look for any Id field in the input
    const idFields = findIdProperties(req.body);
    console.log('Found Id fields in request:', idFields);
    
    // Manually create a completely clean message body
    const messageBody = JSON.stringify({
      event: req.body.event,
      time: req.body.time,
      payload: req.body.payload
    });

    // Create the most minimal possible params object
    const params = {
      QueueUrl: process.env.SQS_QUEUE_URL,
      MessageBody: messageBody,
      MessageGroupId: "debug-group",
      MessageDeduplicationId: deduplicationId
    };
    
    // Check for any Id fields in the params
    const paramIdFields = findIdProperties(params);
    console.log('Found Id fields in params:', paramIdFields);
    
    console.log('Final SQS params:', util.inspect(params, { depth: 10 }));
    
    // Only try to send if we found no Id fields
    if (paramIdFields.length > 0) {
      console.log('Skipping SQS send due to Id fields found in params');
      return res.status(200).json({ 
        success: false, 
        message: "Found Id fields in params, skipped sending",
        idFields: paramIdFields
      });
    }

    // Try sending with minimal SQS config
    const minimalSqs = new AWS.SQS({
      region: process.env.AWS_REGION
    });
    
    console.log('Attempting to send message...');
    const result = await minimalSqs.sendMessage(params).promise();
    console.log('SQS response:', result);
    
    return res.status(200).json({ 
      success: true, 
      messageId: result.MessageId
    });
  } catch (error) {
    console.error('Debug handler error:', util.inspect(error, { depth: 5 }));
    
    // Check if error contains "UnexpectedParameter"
    if (error.message && error.message.includes('UnexpectedParameter')) {
      // Try to parse the error message to extract the parameter name
      const match = error.message.match(/Unexpected key '([^']+)'/);
      const unexpectedParam = match ? match[1] : 'unknown';
      
      return res.status(500).json({
        error: 'Unexpected parameter found',
        parameter: unexpectedParam,
        message: error.message
      });
    }
    
    return res.status(500).json({ 
      error: 'Failed to queue message',
      details: error.message,
      code: error.code || 'unknown'
    });
  }
} 