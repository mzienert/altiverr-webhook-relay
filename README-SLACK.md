# Slack Webhook Relay for n8n with SQS Queue

This service relays Slack webhooks from Vercel to an AWS SQS queue, which can then be consumed by your local n8n instance using a scheduled workflow.

## How It Works

1. Slack sends a webhook request to your Vercel-hosted endpoint: `https://altiverr-webhook-relay.vercel.app/api/slack-webhook/[your-id]`
2. The relay immediately responds to Slack with a success response
3. The relay then stores the webhook payload in an AWS SQS queue
4. Your n8n instance polls the queue using a scheduled workflow
5. When messages are found, n8n processes them as if they came directly from Slack

## Setup Instructions

### 1. Configure your Slack App

In your Slack App's Event Subscriptions section:

1. Set the Request URL to: `https://altiverr-webhook-relay.vercel.app/api/slack-webhook/[your-id]`
   - Replace `[your-id]` with a unique identifier (this can match your n8n webhook ID for simplicity)
2. Subscribe to the bot events you need (e.g., `message.channels`)
3. Save your changes

### 2. Set up your SQS Queue

1. Create an SQS queue in your AWS account (use FIFO queue for ordered delivery)
   - Recommended name: `slack-webhook-relay.fifo`
   - Enable content-based deduplication
2. Note the queue URL and region
3. Configure the Vercel environment variables:
   ```
   SLACK_SQS_QUEUE_URL=https://sqs.[region].amazonaws.com/[account-id]/[queue-name]
   AWS_REGION=[region]
   AWS_ACCESS_KEY_ID=[your-access-key]
   AWS_SECRET_ACCESS_KEY=[your-secret-key]
   ```

### 3. Create n8n Scheduled Workflow

Create a workflow in n8n with these nodes:

1. **Schedule Trigger** - Set to run every few minutes
2. **AWS SQS** node:
   - Operation: Receive message
   - Queue URL: Your SQS queue URL
   - Poll once: true
   - Max messages: 10
3. **Split In Batches** node to process each message individually
4. **Process webhook data** - Your custom workflow logic
5. **AWS SQS** node:
   - Operation: Delete message
   - Queue URL: Your SQS queue URL
   - Receipt Handle: Obtained from first SQS node

## Testing

To test the setup:

1. Ensure your local n8n is running
2. Make sure your scheduled workflow is active
3. In Slack, perform the action that should trigger the webhook
4. Check your SQS queue for new messages
5. Wait for the scheduled workflow to run and process the messages

## Environment Variables for Vercel

- `SLACK_SQS_QUEUE_URL`: The URL of your AWS SQS queue for Slack webhooks
- `AWS_REGION`: The AWS region where your queue is located
- `AWS_ACCESS_KEY_ID`: Your AWS access key
- `AWS_SECRET_ACCESS_KEY`: Your AWS secret access key 