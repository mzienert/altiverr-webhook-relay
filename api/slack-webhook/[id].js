// Slack webhook relay handler
// This handler accepts Slack webhook events and queues them in SQS
// It specifically handles the URL verification challenge from Slack

const AWS = require('aws-sdk');
const crypto = require('crypto');

// Initialize SQS with timeout settings
const sqs = new AWS.SQS({
  region: process.env.AWS_REGION,
  httpOptions: {
    timeout: 5000, // 5 second timeout for SQS operations
    connectTimeout: 1000 // 1 second to establish connection
  }
});

// Environment variables
const QUEUE_URL = process.env.SLACK_SQS_QUEUE_URL;

export default async function handler(req, res) {
  const startTime = Date.now();
  const { id } = req.query;
  
  // Only allow POST method
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log(`[${Date.now() - startTime}ms] Processing webhook for ID ${id}`);

    // Handle Slack URL verification challenge first
    if (req.body.type === 'url_verification') {
      console.log('Handling Slack URL verification challenge');
      return res.status(200).json({ challenge: req.body.challenge });
    }

    // Check SQS configuration immediately
    if (!QUEUE_URL) {
      console.error('SLACK_SQS_QUEUE_URL is not set - cannot queue message');
      return res.status(200).json({ 
        success: false, 
        error: 'Queue not configured'
      });
    }

    // Log the incoming webhook data and environment details
    console.log(`[${Date.now() - startTime}ms] Received Slack webhook:`, {
      id,
      type: req.body.type,
      eventType: req.body.event?.type,
      region: process.env.AWS_REGION || 'not set',
      queueUrl: QUEUE_URL,
      hasAccessKey: !!process.env.AWS_ACCESS_KEY_ID,
      hasSecretKey: !!process.env.AWS_SECRET_ACCESS_KEY
    });

    // Prepare SQS message before sending response
    const deduplicationId = crypto
      .createHash('sha256')
      .update(`${Date.now()}-${Math.random()}-${id}`)
      .digest('hex');
    
    const messageBody = JSON.stringify({
      source: 'slack',
      webhookId: id,
      headers: {
        ...(req.headers['x-slack-signature'] && {
          'x-slack-signature': req.headers['x-slack-signature']
        }),
        ...(req.headers['x-slack-request-timestamp'] && {
          'x-slack-request-timestamp': req.headers['x-slack-request-timestamp']
        })
      },
      payload: req.body,
      timestamp: new Date().toISOString()
    });

    const messageParams = {
      QueueUrl: QUEUE_URL,
      MessageBody: messageBody,
      MessageGroupId: `slack-${id}`,
      MessageDeduplicationId: deduplicationId
    };

    // Send response to Slack before SQS operation
    res.status(200).json({ success: true });
    
    console.log(`[${Date.now() - startTime}ms] Sending message to SQS:`, {
      messageGroupId: messageParams.MessageGroupId,
      deduplicationId: messageParams.MessageDeduplicationId,
      bodyLength: messageBody.length
    });

    try {
      const result = await sqs.sendMessage(messageParams).promise();
      console.log(`[${Date.now() - startTime}ms] Successfully queued message:`, {
        messageId: result.MessageId,
        sequenceNumber: result.SequenceNumber
      });
    } catch (queueError) {
      console.error(`[${Date.now() - startTime}ms] Failed to queue message:`, {
        error: queueError.message,
        code: queueError.code,
        statusCode: queueError.statusCode,
        requestId: queueError.requestId
      });
      // Don't throw - we've already sent success to Slack
    }
    
    console.log(`[${Date.now() - startTime}ms] Webhook processing completed`);
  } catch (error) {
    console.error(`[${Date.now() - startTime}ms] Webhook error:`, {
      message: error.message,
      code: error.code
    });
    
    // Still return 200 to Slack
    return res.status(200).json({ 
      received: true,
      error: 'Failed to process webhook'
    });
  }
} 