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

## API Endpoints

This service provides the following API endpoints:

### 1. Receive Slack Webhooks

```
POST /api/slack-webhook/[id]
```

This endpoint:
- Receives webhooks from Slack
- Handles the URL verification challenge
- Queues the webhook payload in SQS
- Always returns a 200 response to Slack

### 2. Poll for Messages

```
GET /api/slack-queue
```

This endpoint retrieves messages from the Slack SQS queue.

Query parameters:
- `max`: Maximum number of messages to retrieve (1-10, default 5)
- `visibility`: Visibility timeout in seconds (default 30)
- `wait`: Wait time in seconds for long polling (default 0)
- `attributes`: Set to 'true' to include message attributes
- `delete`: Set to 'true' to delete messages after receiving
- `stats`: Set to 'true' to include queue statistics

Headers:
- `x-api-key`: Authentication key (optional, if configured)

Example:
```
GET https://altiverr-webhook-relay.vercel.app/api/slack-queue?max=5&delete=true
```

### 3. Delete Message

```
DELETE /api/slack-delete-message?receiptHandle=[receipt-handle]
```
or
```
POST /api/slack-delete-message
{ "receiptHandle": "[receipt-handle]" }
```

This endpoint deletes a specific message from the queue after it has been processed.

Headers:
- `x-api-key`: Authentication key (optional, if configured)

## Testing

To test the setup:

1. Ensure your local n8n is running
2. Make sure your scheduled workflow is active
3. In Slack, perform the action that should trigger the webhook
4. Check your SQS queue for new messages by calling:
   ```
   GET https://altiverr-webhook-relay.vercel.app/api/slack-queue
   ```
5. Wait for the scheduled workflow to run and process the messages

## Environment Variables for Vercel

- `SLACK_SQS_QUEUE_URL`: The URL of your AWS SQS queue for Slack webhooks
- `AWS_REGION`: The AWS region where your queue is located
- `AWS_ACCESS_KEY_ID`: Your AWS access key
- `AWS_SECRET_ACCESS_KEY`: Your AWS secret access key
- `SLACK_QUEUE_API_KEY`: (Optional) API key for accessing the queue endpoints 