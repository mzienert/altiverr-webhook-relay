# Slack Webhook Relay for n8n

This simple service relays Slack webhooks from Vercel to your local n8n instance. It's designed for development and demo purposes when you need Slack to trigger workflows on your local n8n server.

## How It Works

1. Slack sends a webhook request to your Vercel-hosted endpoint: `https://altiverr-webhook-relay.vercel.app/api/slack-webhook/[your-id]`
2. The relay immediately responds to Slack with a success response
3. The relay then forwards the webhook payload to your local n8n instance
4. Your local n8n processes the webhook as if it came directly from Slack

## Setup Instructions

### 1. Configure your Slack App

In your Slack App's Event Subscriptions section:

1. Set the Request URL to: `https://altiverr-webhook-relay.vercel.app/api/slack-webhook/[your-id]`
   - Replace `[your-id]` with a unique identifier (this can match your n8n webhook ID for simplicity)
2. Subscribe to the bot events you need (e.g., `message.channels`)
3. Save your changes

### 2. Set up your Local Environment

For the relay to forward requests to your local n8n instance, you need to make your local n8n publicly accessible. Use one of these methods:

#### Option A: Use ngrok (easiest for demos)

1. Install ngrok: `npm install -g ngrok` or download from [ngrok.com](https://ngrok.com/)
2. Start your n8n server locally (usually on port 5678)
3. Start ngrok: `ngrok http 5678`
4. Note the ngrok URL (e.g., `https://1a2b-3c4d-5e6f.ngrok.io`)
5. Set the environment variable for the relay:
   ```
   export LOCAL_N8N_WEBHOOK_URL=https://1a2b-3c4d-5e6f.ngrok.io/webhook/[your-n8n-webhook-id]
   ```

#### Option B: Port forwarding from your router

1. Configure your router to forward port 5678 to your local machine
2. Get your public IP address
3. Set the environment variable:
   ```
   export LOCAL_N8N_WEBHOOK_URL=http://[your-public-ip]:5678/webhook/[your-n8n-webhook-id]
   ```

### 3. Deploy the Relay (already done on Vercel)

The relay is already deployed at `https://altiverr-webhook-relay.vercel.app/`.

## Testing

To test the setup:

1. Ensure your local n8n is running
2. Make sure your ngrok or port forwarding is active
3. In Slack, perform the action that should trigger the webhook
4. Check your n8n logs for incoming webhook requests

## Troubleshooting

- **Slack verification issues**: The relay handles Slack's URL verification challenge automatically
- **Connection issues**: Check that your ngrok tunnel or port forwarding is working correctly
- **n8n webhook issues**: Verify that your n8n webhook is configured correctly and the ID matches

## Security Considerations

This relay is designed for development and demo purposes. For production use, consider:

1. Adding authentication
2. Implementing signature verification
3. Using a more robust relay solution

## Environment Variables

- `LOCAL_N8N_WEBHOOK_URL`: The URL to forward Slack webhooks to (defaults to `http://localhost:5678/webhook/[id]` if not set) 