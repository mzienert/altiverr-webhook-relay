// Slack webhook relay handler
// This handler accepts Slack webhook events and queues them in SQS
// It specifically handles the URL verification challenge from Slack

const AWS = require('aws-sdk');
const crypto = require('crypto');

// Initialize SQS with more aggressive timeouts for Vercel
const sqs = new AWS.SQS({
  region: process.env.AWS_REGION,
  httpOptions: {
    timeout: 2000, // 2 second timeout for SQS operations
    connectTimeout: 500 // 500ms to establish connection
  },
  maxRetries: 0 // Don't retry in serverless environment
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

    // Handle Slack URL verification challenge first (quick response)
    if (req.body.type === 'url_verification') {
      console.log('Handling Slack URL verification challenge');
      return res.status(200).json({ challenge: req.body.challenge });
    }

    // Send success response to Slack IMMEDIATELY - most important step
    // This ensures Slack gets a success response even if SQS operations time out
    res.status(200).json({ success: true });
    
    // Log main details
    console.log(`[${Date.now() - startTime}ms] Received Slack webhook:`, {
      id,
      type: req.body.type,
      eventType: req.body.event?.type,
      region: process.env.AWS_REGION || 'not set',
      queueUrl: QUEUE_URL?.substring(0, 40) + '...' || 'not set',
      hasAccessKey: !!process.env.AWS_ACCESS_KEY_ID,
      hasSecretKey: !!process.env.AWS_SECRET_ACCESS_KEY
    });

    // Check SQS configuration
    if (!QUEUE_URL) {
      console.error('SLACK_SQS_QUEUE_URL is not set - cannot queue message');
      return; // Already sent success to Slack
    }
    
    // Prepare SQS message
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
    
    console.log(`[${Date.now() - startTime}ms] Sending message to SQS:`, {
      messageGroupId: messageParams.MessageGroupId,
      deduplicationId: messageParams.MessageDeduplicationId.substring(0, 10) + '...',
      bodyLength: messageBody.length
    });

    // Send with Promise.race to implement our own timeout
    try {
      const sendPromise = sqs.sendMessage(messageParams).promise();
      
      // Create a timeout promise
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('SQS operation timed out')), 2500)
      );
      
      // Race the SQS operation against the timeout
      const result = await Promise.race([sendPromise, timeoutPromise]);
      
      console.log(`[${Date.now() - startTime}ms] Successfully queued message:`, {
        messageId: result.MessageId,
        sequenceNumber: result.SequenceNumber
      });
    } catch (queueError) {
      console.error(`[${Date.now() - startTime}ms] Failed to queue message:`, {
        error: queueError.message,
        code: queueError.code,
        statusCode: queueError.statusCode
      });
    }
    
    console.log(`[${Date.now() - startTime}ms] Webhook processing completed`);
  } catch (error) {
    console.error(`[${Date.now() - startTime}ms] Webhook error:`, {
      message: error.message,
      code: error.code
    });
    
    // Ensure we send a response if we haven't already
    if (!res.writableEnded) {
      return res.status(200).json({ 
        received: true,
        error: 'Failed to process webhook'
      });
    }
  }
} 