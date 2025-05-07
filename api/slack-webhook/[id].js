// Minimal Slack webhook handler - simplified to mirror successful Calendly implementation
const AWS = require('aws-sdk');
const crypto = require('crypto');

// Initialize SQS with bare minimum config
const sqs = new AWS.SQS({
  region: process.env.AWS_REGION,
  maxRetries: 0
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

  // Return success immediately for URL verification challenges
  if (req.body.type === 'url_verification') {
    return res.status(200).json({ challenge: req.body.challenge });
  }

  // Send success response to Slack IMMEDIATELY
  res.status(200).json({ success: true });
  
  try {
    // Generate unique deduplication ID
    const deduplicationId = crypto
      .createHash('sha256')
      .update(`${Date.now()}-${Math.random()}`)
      .digest('hex');
    
    // Create message object with only essential fields
    const message = {
      source: 'slack',
      webhookId: id,
      event: req.body.event,
      eventType: req.body.type,
      timestamp: new Date().toISOString()
    };
    
    // Stringify the message body
    const messageBody = JSON.stringify(message);

    // Create parameters with Object.create(null) - same as Calendly implementation
    const messageParams = Object.create(null);
    messageParams.QueueUrl = QUEUE_URL;
    messageParams.MessageBody = messageBody;
    messageParams.MessageGroupId = "slack-events"; // Same style as Calendly's "calendly-events"
    messageParams.MessageDeduplicationId = deduplicationId;

    console.log('Sending Slack event to SQS queue...');
    
    // Send the message to SQS
    await sqs.sendMessage(messageParams).promise();
    console.log('Successfully sent Slack event to SQS');
  } catch (error) {
    console.error('Failed to queue Slack event:', error.message);
  }
} 