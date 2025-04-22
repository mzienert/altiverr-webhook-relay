const AWS = require('aws-sdk');
const crypto = require('crypto');

// Enable AWS SDK logging
AWS.config.logger = console;

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
    console.log('Webhook payload:', JSON.stringify(payload));

    // Prepare a clean message body without any Id fields
    const messageBody = {
      event: payload.event,
      time: payload.time,
      payload: payload.payload
    };

    // Remove any potential 'id' or 'Id' fields that might be causing issues
    if (messageBody.payload && messageBody.payload.id) delete messageBody.payload.id;
    if (messageBody.payload && messageBody.payload.Id) delete messageBody.payload.Id;

    console.log('Preparing SQS message:', {
      QueueUrl: QUEUE_URL,
      MessageGroupId: 'calendly-events',
      MessageDeduplicationId: deduplicationId
    });

    const params = {
      QueueUrl: QUEUE_URL,
      MessageBody: JSON.stringify(messageBody),
      MessageGroupId: "calendly-events",
      MessageDeduplicationId: deduplicationId
    };

    try {
      const result = await sqs.sendMessage(params).promise();
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
        retryable: sqsError.retryable,
        stack: sqsError.stack
      });
      throw sqsError;
    }
  } catch (err) {
    console.error('Failed to process webhook:', {
      error: err.message,
      code: err.code,
      statusCode: err.statusCode,
      requestId: err.requestId,
      stack: err.stack
    });
    res.status(500).json({ 
      error: 'Failed to queue message',
      details: err.message,
      code: err.code
    });
  }
}
