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

    // Log the incoming webhook data
    console.log(`Received Slack webhook for ID ${id}:`, JSON.stringify(req.body));
    
    // IMPORTANT: Send success response immediately to Slack
    // This prevents Slack from retrying if queue operations fail
    res.status(200).json({ success: true });
    
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

    // Prepare the SQS message parameters
    const messageParams = {
      QueueUrl: QUEUE_URL,
      MessageBody: messageBody,
      MessageGroupId: `slack-${id}`, // For FIFO queues
      MessageDeduplicationId: deduplicationId // For FIFO queues
    };

    try {
      // Send the message to SQS
      const result = await sqs.sendMessage(messageParams).promise();
      console.log(`Queued Slack webhook for ID ${id}, message ID: ${result.MessageId}`);
    } catch (queueError) {
      // Log the error but don't fail - we've already sent success to Slack
      console.error('Failed to queue Slack webhook:', queueError.message);
    }
    
  } catch (error) {
    console.error('Slack webhook error:', {
      message: error.message,
      code: error.code
    });
    
    // We still return 200 to Slack to prevent retries
    // Even though there was an error processing
    return res.status(200).json({ 
      received: true,
      error: 'Failed to process webhook'
    });
  }
} 