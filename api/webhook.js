// Minimal webhook handler for Calendly to SQS
const AWS = require('aws-sdk');
const crypto = require('crypto');

// Initialize SQS
const sqs = new AWS.SQS({
  region: process.env.AWS_REGION
});

// Environment variables
const QUEUE_URL = process.env.SQS_QUEUE_URL;
const SIGNING_KEY = process.env.CALENDLY_WEBHOOK_SIGNING_KEY;

// Signature verification
function verifySignature(payload, signature, timestamp) {
  try {
    const signaturePayload = `${timestamp}.${payload}`;
    const expectedSignature = crypto
      .createHmac('sha256', SIGNING_KEY)
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

export default async function handler(req, res) {
  // Only allow POST method
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('Webhook received');
    
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

    // Generate unique deduplication ID
    const deduplicationId = crypto
      .createHash('sha256')
      .update(`${Date.now()}-${Math.random()}`)
      .digest('hex');
    
    // Create clean message body
    const messageBody = JSON.stringify({
      event: req.body.event,
      time: req.body.time,
      payload: req.body.payload
    });

    // Explicitly define the exact parameters SQS expects
    // Use a new object literal, not an object that might have prototype properties
    const messageParams = Object.create(null);
    messageParams.QueueUrl = QUEUE_URL;
    messageParams.MessageBody = messageBody; 
    messageParams.MessageGroupId = "calendly-events";
    messageParams.MessageDeduplicationId = deduplicationId;
    
    console.log('Sending message to SQS with params:', {
      QueueUrl: QUEUE_URL,
      MessageGroupId: "calendly-events",
      MessageDeduplicationId: deduplicationId.substring(0, 10) + '...'
    });

    // Send message
    const result = await sqs.sendMessage(messageParams).promise();
    console.log('SQS response:', result);
    
    return res.status(200).json({ 
      success: true, 
      messageId: result.MessageId 
    });
  } catch (error) {
    console.error('Webhook error:', {
      message: error.message,
      code: error.code,
      stack: error.stack ? error.stack.split('\n')[0] : null
    });
    
    return res.status(500).json({ 
      error: 'Failed to queue message',
      details: error.message
    });
  }
}
