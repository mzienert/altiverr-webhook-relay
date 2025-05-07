// Webhook handler for Calendly to SQS
const AWS = require('aws-sdk');
const crypto = require('crypto');

// Initialize SQS
const sqs = new AWS.SQS({
  region: process.env.AWS_REGION
});

// Environment variables
const QUEUE_URL = process.env.SQS_QUEUE_URL;
const SIGNING_KEY = process.env.CALENDLY_WEBHOOK_SIGNING_KEY;
const REQUIRE_SIGNATURE = process.env.REQUIRE_SIGNATURE === 'true'; // Default to not requiring if not set

// Signature verification
function verifySignature(payload, signature, timestamp) {
  try {
    // If signature verification is not required, return true
    if (!REQUIRE_SIGNATURE) {
      console.log('Signature verification is disabled');
      return true;
    }
    
    // If no signing key is available, we can't verify
    if (!SIGNING_KEY) {
      console.warn('No signing key available, skipping verification');
      return true;
    }
    
    // Create the signature payload
    const signaturePayload = `${timestamp}.${payload}`;
    
    // Calculate expected signature
    const expectedSignature = crypto
      .createHmac('sha256', SIGNING_KEY)
      .update(signaturePayload)
      .digest('hex');
    
    // Simple string comparison for production use
    return expectedSignature === signature;
  } catch (err) {
    console.error('Signature verification error:', err);
    return false;
  }
}

module.exports = async function handler(req, res) {
  // Only allow POST method
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Verify signature if headers are present
    const signature = req.headers['x-calendly-signature'];
    const timestamp = req.headers['x-calendly-timestamp'];
    
    if (!signature || !timestamp) {
      console.warn('Missing signature headers - verification will be skipped');
    }
    const rawBody = JSON.stringify(req.body);
    
    // Verify signature if possible
    const isValid = !signature || !timestamp || verifySignature(rawBody, signature, timestamp);
    
    // If signature verification is required and fails, return 401
    if (REQUIRE_SIGNATURE && !isValid) {
      return res.status(401).json({ 
        error: 'Invalid signature',
        debug: {
          receivedSignature: signature,
          timestamp: timestamp,
          bodyLength: rawBody.length
        }
      });
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

    // Send message
    const result = await sqs.sendMessage(messageParams).promise();
    
    return res.status(200).json({ 
      success: true, 
      messageId: result.MessageId 
    });
  } catch (error) {
    console.error('Webhook error:', {
      message: error.message,
      code: error.code
    });
    
    return res.status(500).json({ 
      error: 'Failed to queue message',
      details: error.message
    });
  }
}
