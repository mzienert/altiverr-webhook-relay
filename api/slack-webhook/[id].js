// Slack webhook relay handler
// This handler accepts Slack webhook events and queues them in SQS
// It specifically handles the URL verification challenge from Slack

const AWS = require('aws-sdk');
const crypto = require('crypto');

// Initialize SQS with detailed debugging
AWS.config.logger = console;

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

    // Send with improved error handling
    try {
      console.log(`[${Date.now() - startTime}ms] SQS Request start`);
      
      // Create timer for detailed debugging
      const sqsTimer = setTimeout(() => {
        console.log(`[${Date.now() - startTime}ms] SQS operation still running (hasn't completed or errored yet)`);
      }, 1000);
      
      // Send the message
      const sendPromise = sqs.sendMessage(messageParams).promise();
      
      // Create a timeout promise
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('SQS operation timed out after 2.5s')), 2500)
      );
      
      // Race the SQS operation against the timeout
      const result = await Promise.race([sendPromise, timeoutPromise]);
      
      // Clear the timer
      clearTimeout(sqsTimer);
      
      console.log(`[${Date.now() - startTime}ms] Successfully queued message:`, {
        messageId: result.MessageId,
        sequenceNumber: result.SequenceNumber,
        awsRequestId: result.$response?.requestId
      });
    } catch (queueError) {
      // Log with comprehensive error details
      const errorDetails = {
        message: queueError.message,
        code: queueError.code,
        name: queueError.name,
        statusCode: queueError.statusCode,
        time: queueError.time,
        retryable: queueError.retryable,
        aborted: queueError.aborted,
        requestId: queueError.requestId,
        region: queueError.region,
        hostname: queueError.hostname,
        response: queueError.$response ? {
          requestId: queueError.$response.requestId,
          statusCode: queueError.$response.statusCode,
          retryable: queueError.$response.retryable,
          error: queueError.$response.error
        } : undefined
      };
      
      console.error(`[${Date.now() - startTime}ms] Failed to queue message:`, errorDetails);
      
      // Try to log stack trace separately for better debugging
      if (queueError.stack) {
        console.error(`[${Date.now() - startTime}ms] Error stack trace:`, queueError.stack);
      }
    }
    
    console.log(`[${Date.now() - startTime}ms] Webhook processing completed`);
  } catch (error) {
    // Log comprehensive error details
    const errorObj = {
      message: error.message,
      name: error.name,
      code: error.code,
      stack: error.stack
    };
    
    console.error(`[${Date.now() - startTime}ms] Webhook error:`, errorObj);
    
    // Ensure we send a response if we haven't already
    if (!res.writableEnded) {
      return res.status(200).json({ 
        received: true,
        error: 'Failed to process webhook'
      });
    }
  }
} 