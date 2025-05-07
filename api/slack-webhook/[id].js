// Slack webhook relay handler
// This handler accepts Slack webhook events and queues them in SQS
// It specifically handles the URL verification challenge from Slack

const AWS = require('aws-sdk');
const crypto = require('crypto');

// Initialize SQS
const sqs = new AWS.SQS({
  region: process.env.AWS_REGION
});

// Environment variables
const QUEUE_URL = process.env.SLACK_SQS_QUEUE_URL;

export default async function handler(req, res) {
  // Get the webhook ID from the URL
  const { id } = req.query;
  
  // Only allow POST method
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Handle Slack URL verification challenge
    // https://api.slack.com/events/url_verification
    if (req.body.type === 'url_verification') {
      console.log('Handling Slack URL verification challenge');
      return res.status(200).json({ challenge: req.body.challenge });
    }

    // Log the incoming webhook data and environment details (for debugging)
    console.log(`Received Slack webhook for ID ${id}:`, JSON.stringify(req.body));
    console.log(`AWS Region: ${process.env.AWS_REGION || 'not set'}`);
    console.log(`Queue URL: ${QUEUE_URL || 'not set'}`);
    console.log(`AWS Access Key ID is set: ${process.env.AWS_ACCESS_KEY_ID ? 'yes' : 'no'}`);
    console.log(`AWS Secret Access Key is set: ${process.env.AWS_SECRET_ACCESS_KEY ? 'yes' : 'no'}`);
    
    // IMPORTANT: Send success response immediately to Slack
    // This prevents Slack from retrying if queue operations fail
    res.status(200).json({ success: true });
    
    // Check if SQS is configured
    if (!QUEUE_URL) {
      console.error('SLACK_SQS_QUEUE_URL is not set - cannot queue message');
      return;
    }
    
    // Generate unique deduplication ID
    const deduplicationId = crypto
      .createHash('sha256')
      .update(`${Date.now()}-${Math.random()}-${id}`)
      .digest('hex');
    
    // Create the message payload
    const messageBody = JSON.stringify({
      source: 'slack',
      webhookId: id,
      headers: {
        // Include relevant headers
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

    // Check if this is a FIFO queue (URL ends with .fifo)
    const isFifoQueue = QUEUE_URL.toLowerCase().endsWith('.fifo');
    
    // Prepare the SQS message parameters
    const messageParams = {
      QueueUrl: QUEUE_URL,
      MessageBody: messageBody
    };
    
    // Add FIFO-specific attributes if needed
    if (isFifoQueue) {
      messageParams.MessageGroupId = `slack-${id}`; // For FIFO queues
      messageParams.MessageDeduplicationId = deduplicationId; // For FIFO queues
      console.log('Using FIFO queue parameters');
    }

    try {
      console.log('Attempting to send message to SQS...');
      // Send the message to SQS
      const result = await sqs.sendMessage(messageParams).promise();
      console.log(`Successfully queued Slack webhook for ID ${id}, message ID: ${result.MessageId}`);
    } catch (queueError) {
      // Log the detailed error but don't fail - we've already sent success to Slack
      console.error('Failed to queue Slack webhook:', {
        message: queueError.message,
        code: queueError.code,
        statusCode: queueError.statusCode,
        requestId: queueError.requestId,
        time: queueError.time,
        stack: queueError.stack
      });
    }
    
  } catch (error) {
    console.error('Slack webhook error:', {
      message: error.message,
      code: error.code,
      stack: error.stack
    });
    
    // We still return 200 to Slack to prevent retries
    // Even though there was an error processing
    return res.status(200).json({ 
      received: true,
      error: 'Failed to process webhook'
    });
  }
} 