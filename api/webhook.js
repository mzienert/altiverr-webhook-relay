const AWS = require('aws-sdk');
const crypto = require('crypto');

// Enable AWS SDK logging
AWS.config.logger = console;

// Initialize SQS with minimal configuration
const sqs = new AWS.SQS({
  region: process.env.AWS_REGION,
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

const QUEUE_URL = process.env.SQS_QUEUE_URL;
const CALENDLY_WEBHOOK_SIGNING_KEY = process.env.CALENDLY_WEBHOOK_SIGNING_KEY;

function verifyCalendlyWebhookSignature(payload, signature, timestamp) {
  const signaturePayload = `${timestamp}.${payload}`;
  const expectedSignature = crypto
    .createHmac('sha256', CALENDLY_WEBHOOK_SIGNING_KEY)
    .update(signaturePayload)
    .digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Only POST allowed' });
  }

  try {
    console.log('Environment check:', {
      hasRegion: !!process.env.AWS_REGION,
      hasAccessKey: !!process.env.AWS_ACCESS_KEY_ID,
      hasSecretKey: !!process.env.AWS_SECRET_ACCESS_KEY,
      hasQueueUrl: !!process.env.SQS_QUEUE_URL,
      region: process.env.AWS_REGION,
      queueUrl: process.env.SQS_QUEUE_URL
    });

    // Verify webhook signature for Calendly v2
    const signature = req.headers['x-calendly-signature'];
    const timestamp = req.headers['x-calendly-timestamp'];
    
    if (!signature || !timestamp) {
      return res.status(401).json({ error: 'Missing required headers' });
    }

    const rawBody = JSON.stringify(req.body);
    const isValid = verifyCalendlyWebhookSignature(rawBody, signature, timestamp);

    if (!isValid) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // Process the webhook payload
    const payload = req.body;
    
    // Create a deterministic deduplication ID based on the event
    const deduplicationId = crypto
      .createHash('sha256')
      .update(`${payload.time}-${payload.event}-${JSON.stringify(payload.payload)}`)
      .digest('hex');

    // Debug the incoming payload
    console.log('Webhook payload (raw):', rawBody);

    // Create message body as a simple, flat object
    const messageContent = JSON.stringify({
      event: payload.event,
      time: payload.time,
      payload: payload.payload
    });

    console.log('Message content:', messageContent);

    // IMPORTANT: Only use the exact parameters expected by SQS sendMessage
    // Explicitly creating a new object with only the required fields
    const sqsParams = {
      QueueUrl: QUEUE_URL,
      MessageBody: messageContent,
      MessageGroupId: "calendly-events",
      MessageDeduplicationId: deduplicationId
    };

    // Convert to JSON string and back to ensure no unexpected properties
    const paramsString = JSON.stringify(sqsParams);
    console.log('SQS params as JSON string:', paramsString);
    
    // Parse back to object to ensure clean structure
    const cleanParams = JSON.parse(paramsString);
    console.log('Clean SQS params:', cleanParams);

    try {
      console.log('Attempting to send message to SQS with clean params...');
      // Use the cleanParams object instead of the original params
      const result = await sqs.sendMessage(cleanParams).promise();
      console.log('Successfully sent message to SQS:', result);
      res.status(200).json({ success: true, messageId: result.MessageId });
    } catch (sqsError) {
      console.error('SQS Error Details:', {
        code: sqsError.code,
        message: sqsError.message,
        statusCode: sqsError.statusCode,
        requestId: sqsError.requestId,
        time: sqsError.time,
        region: process.env.AWS_REGION,
        hostname: sqsError.hostname,
        retryable: sqsError.retryable
      });
      
      // Log the exact error with stringify to see full error details
      console.error('Full SQS error:', JSON.stringify(sqsError, null, 2));
      
      throw sqsError;
    }
  } catch (err) {
    console.error('Failed to process webhook:', {
      error: err.message,
      code: err.code,
      statusCode: err.statusCode,
      requestId: err.requestId
    });
    
    res.status(500).json({ 
      error: 'Failed to queue message',
      details: err.message,
      code: err.code
    });
  }
}
