const AWS = require('aws-sdk');
const crypto = require('crypto');

// Initialize SQS with minimal configuration
const sqs = new AWS.SQS({
  region: process.env.AWS_REGION,
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

const QUEUE_URL = process.env.SQS_QUEUE_URL;
const CALENDLY_WEBHOOK_SIGNING_KEY = process.env.CALENDLY_WEBHOOK_SIGNING_KEY;

function verifyCalendlySignature(payload, signature, timestamp) {
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
  // Only allow POST method
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Log environment variables (redacted)
    console.log('Environment check:', {
      hasRegion: !!process.env.AWS_REGION,
      hasAccessKey: !!process.env.AWS_ACCESS_KEY_ID,
      hasSecretKey: !!process.env.AWS_SECRET_ACCESS_KEY,
      hasQueueUrl: !!process.env.SQS_QUEUE_URL
    });

    // Verify webhook signature
    const signature = req.headers['x-calendly-signature'];
    const timestamp = req.headers['x-calendly-timestamp'];
    
    if (!signature || !timestamp) {
      return res.status(401).json({ error: 'Missing signature headers' });
    }

    const rawBody = JSON.stringify(req.body);
    if (!verifyCalendlySignature(rawBody, signature, timestamp)) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // Extract webhook data
    const webhookData = req.body;
    
    // Create deduplication ID from event data
    const deduplicationId = crypto
      .createHash('sha256')
      .update(`${webhookData.time}-${webhookData.event}-${Date.now()}`)
      .digest('hex');

    // Create clean message body manually
    const messageBody = JSON.stringify({
      event: webhookData.event,
      time: webhookData.time,
      payload: webhookData.payload
    });

    // Construct parameters exactly as in our working test script
    const params = {
      QueueUrl: QUEUE_URL,
      MessageBody: messageBody,
      MessageGroupId: "calendly-events",
      MessageDeduplicationId: deduplicationId
    };

    // Log prepared parameters for debugging
    console.log('Sending to SQS with params:', JSON.stringify(params));

    // Send message to SQS
    const result = await sqs.sendMessage(params).promise();
    console.log('SQS response:', result);
    
    return res.status(200).json({ 
      success: true, 
      messageId: result.MessageId 
    });
  } catch (error) {
    console.error('Webhook error:', {
      message: error.message,
      code: error.code,
      stack: error.stack && error.stack.split('\n').slice(0, 3).join('\n')
    });
    
    return res.status(500).json({ 
      error: 'Failed to queue message',
      details: error.message
    });
  }
}
