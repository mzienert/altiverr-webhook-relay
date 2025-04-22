// Raw webhook handler using AWS SDK methods directly
const AWS = require('aws-sdk');
const crypto = require('crypto');

// Configure AWS (basic configuration only)
AWS.config.update({
  region: process.env.AWS_REGION
});

// Get signing key
const CALENDLY_WEBHOOK_SIGNING_KEY = process.env.CALENDLY_WEBHOOK_SIGNING_KEY;

// Simple signature verification
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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('Raw webhook handler called');
    
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

    // Extract data
    const webhookData = req.body;
    
    // Generate unique deduplication ID
    const deduplicationId = crypto
      .createHash('sha256')
      .update(`${Date.now()}-${Math.random()}`)
      .digest('hex');
    
    // Prepare message
    const messageBody = JSON.stringify({
      event: webhookData.event,
      time: webhookData.time,
      payload: webhookData.payload
    });
    
    // Log params (for debugging)
    console.log('Message params for SQS:', {
      QueueUrl: process.env.SQS_QUEUE_URL,
      MessageBody: messageBody.substring(0, 50) + '...',
      MessageGroupId: "calendly-events",
      MessageDeduplicationId: deduplicationId
    });

    // Send message using raw AWS.Request
    const request = new AWS.Request(new AWS.SQS(), 'sendMessage', {
      QueueUrl: process.env.SQS_QUEUE_URL,
      MessageBody: messageBody,
      MessageGroupId: "calendly-events",
      MessageDeduplicationId: deduplicationId
    });
    
    // Send using promise pattern
    try {
      const response = await new Promise((resolve, reject) => {
        request.send((err, data) => {
          if (err) reject(err);
          else resolve(data);
        });
      });
      
      console.log('SQS raw response:', response);
      return res.status(200).json({ success: true, messageId: response.MessageId });
    } catch (sqsError) {
      console.error('SQS raw error:', sqsError);
      throw sqsError;
    }
  } catch (error) {
    console.error('Webhook raw handler error:', error);
    return res.status(500).json({ 
      error: 'Failed to queue message',
      details: error.message
    });
  }
} 