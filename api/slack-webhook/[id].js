// Simplified Slack webhook handler - matching Calendly implementation
const AWS = require('aws-sdk');
const crypto = require('crypto');

// Initialize SQS with the same config as the Calendly implementation
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

  // Handle Slack URL verification challenge
  if (req.body.type === 'url_verification') {
    return res.status(200).json({ challenge: req.body.challenge });
  }

  try {
    console.log(`Received Slack webhook for ID ${id}`);
    
    // Generate unique deduplication ID (same approach as Calendly)
    const deduplicationId = crypto
      .createHash('sha256')
      .update(`${Date.now()}-${Math.random()}`)
      .digest('hex');
    
    // Create message payload (simplified)
    const messageBody = JSON.stringify({
      source: 'slack',
      webhookId: id,
      event: req.body.event,
      type: req.body.type,
      timestamp: new Date().toISOString()
    });

    // Create parameters using Object.create(null) exactly like Calendly
    const messageParams = Object.create(null);
    messageParams.QueueUrl = QUEUE_URL;
    messageParams.MessageBody = messageBody;
    messageParams.MessageGroupId = "slack-events";  // Static like Calendly
    messageParams.MessageDeduplicationId = deduplicationId;

    console.log('Sending Slack event to queue...');
    
    // Send message to SQS
    const result = await sqs.sendMessage(messageParams).promise();
    
    console.log('Successfully sent to queue:', result.MessageId);
    
    // Return success response to Slack
    return res.status(200).json({ success: true, messageId: result.MessageId });
  } catch (error) {
    console.error('Error processing webhook:', error.message);
    
    // Still return success to Slack to prevent retries
    return res.status(200).json({ 
      success: false, 
      error: 'Failed to process webhook'
    });
  }
} 