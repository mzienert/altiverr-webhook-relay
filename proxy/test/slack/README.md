# Slack Webhook Test Utilities

These utilities allow you to simulate Slack webhook events for testing n8n workflows in development mode.

## Setup

1. Make sure you're in the test directory:
   ```
   cd test/slack
   ```

2. Install dependencies if needed:
   ```
   npm install axios
   ```

3. Make the scripts executable:
   ```
   chmod +x direct-slack-webhook.js
   chmod +x sns-slack-webhook.js
   ```

## Usage

### Testing Direct Slack Webhooks

This simulates a Slack webhook coming directly to your webhook service:

```
node direct-slack-webhook.js "Your custom message text here"
```

or simply:

```
./direct-slack-webhook.js "Your custom message text here"
```

### Testing SNS-Wrapped Slack Webhooks

This simulates a Slack webhook wrapped in an AWS SNS notification format:

```
node sns-slack-webhook.js "Your custom message text here"
```

or simply:

```
./sns-slack-webhook.js "Your custom message text here"
```

## How to Use with n8n

1. Start your local webhook proxy service
2. Put your n8n workflow in "test" mode with the Slack trigger node active
3. Run one of these test scripts to send a simulated webhook
4. The webhook will be processed by your proxy service and forwarded to n8n
5. Your workflow should trigger, allowing you to build and test the conditions following the trigger

## Configuration

You can modify the configuration at the top of each script to change:

- Webhook URLs
- Team/channel/user IDs
- Default message text
- SNS topic ARN (for the SNS-wrapped version)

## Troubleshooting

If the scripts aren't working:

1. Check that your webhook proxy service is running locally
2. Verify the webhook URLs in the script match your local service endpoints
3. Check the console output for any error messages
4. Look at the proxy service logs for detailed processing information

## Example Response from Proxy Service

A successful response should look like:

```
Response: 200 OK
Response data: {
  "success": true,
  "messageId": "slack_msg_T08ME847DE0_C08Q6C6J4BZ_1747274865.493439",
  "forwarded": true
}

Webhook sent successfully! Check your n8n workflow.
```