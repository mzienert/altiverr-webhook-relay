// Simplified Slack webhook handler - matching Calendly implementation
const AWS = require('aws-sdk');
const crypto = require('crypto');

// Initialize SQS with the same config as the Calendly implementation
const sqs = new AWS.SQS({
  region: process.env.AWS_REGION
});

// Environment variables
const QUEUE_URL = process.env.SLACK_SQS_QUEUE_URL;

// Helper function to safely stringify objects with circular references
function safeStringify(obj) {
  const seen = new WeakSet();
  return JSON.stringify(obj, (key, value) => {
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) {
        return '[Circular]';
      }
      seen.add(value);
    }
    return value;
  }, 2);
}

export default async function handler(req, res) {
  // Get the webhook ID from the URL
  const { id } = req.query;
  
  // Only allow POST method
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Log detailed information about the request
  console.log(`======= SLACK WEBHOOK REQUEST (ID: ${id}) =======`);
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log(`Headers: ${safeStringify(req.headers)}`);
  console.log(`Request type: ${req.body.type}`);
  
  // Log different information based on event type
  if (req.body.type === 'event_callback') {
    console.log(`Event type: ${req.body.event?.type}`);
    console.log(`Team: ${req.body.team_id}`);
    console.log(`User: ${req.body.event?.user}`);
    console.log(`Channel: ${req.body.event?.channel}`);
    console.log(`Text: ${req.body.event?.text}`);
    
    // Log full event data (truncated if too large)
    const fullEventStr = safeStringify(req.body);
    if (fullEventStr.length > 1000) {
      console.log(`Full event data (truncated): ${fullEventStr.substring(0, 1000)}...`);
    } else {
      console.log(`Full event data: ${fullEventStr}`);
    }
  } else {
    // For other event types, just log the full body
    console.log(`Full data: ${safeStringify(req.body)}`);
  }
  console.log(`================================================`);

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