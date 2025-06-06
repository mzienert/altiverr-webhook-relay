# altiverr-webhook-relay

A service to relay webhooks from Calendly to AWS SQS.

## Setup

1. Copy `.env.sample` to `.env` and fill in the required values
2. Generate a Vercel token at https://vercel.com/account/tokens and add it to the `.env` file as `VERCEL_TOKEN`
3. Install dependencies with `npm install`

## Testing

To test the webhook locally, run:

```bash
./test-webhook.sh
```

This script will automatically fetch the latest deployment URL from Vercel and send a test webhook to it.

## Queue Endpoints

This project includes two API endpoints for working with messages in the SQS queue:

### Retrieve Queue Messages

```
GET /api/queue
```

Retrieves messages from the SQS queue. Requires the `x-api-key` header.

Query parameters:
- `max`: Maximum number of messages to retrieve (default: 10, max: 10)
- `visibility`: Visibility timeout in seconds (default: 30)
- `wait`: Wait time in seconds for long polling (default: 0)
- `attributes`: Set to 'true' to include message attributes (default: false)
- `stats`: Set to 'true' to include queue statistics (default: false)

### Delete Queue Message

```
POST /api/delete-message
```

Deletes a message from the SQS queue. Requires the `x-api-key` header.

Request body:
```json
{
  "receiptHandle": "message-receipt-handle"
}
```

## Working with Queue Messages

### Visibility Timeout

When retrieving messages from the queue, they become invisible to other consumers for the duration of the visibility timeout (default 30 seconds). This means:

1. If you retrieve a message but don't delete it, it will reappear in the queue after the visibility timeout
2. If you try to view queue messages immediately after viewing them, they may not appear if still within their visibility timeout
3. For deletion operations, you must delete the message within the visibility timeout

### Viewing Queue Messages

To view messages in the queue:

```bash
# View up to 10 messages with a 5-minute visibility timeout
./test-queue.sh --visibility=300

# View up to 5 messages
./test-queue.sh --max=5

# View messages with queue statistics
./test-queue.sh --stats

# View and delete messages
./test-queue.sh --delete

# Peek at messages without affecting their visibility
./peek-queue.sh

# View detailed queue statistics
./queue-stats.sh
```

The `peek-queue.sh` script is useful for monitoring the queue without affecting message processing, as it sets a visibility timeout of 0 seconds.

The `queue-stats.sh` script provides detailed information about the queue status directly from AWS, showing metrics like approximate message count, delay seconds, and other queue attributes.

## OAuth Integration

This project includes an OAuth callback endpoint used by n8n for service integrations (like Slack). The endpoint is structured to support n8n's standardized OAuth flow:

```
/api/oauth2/rest/oauth2-credential/callback
```

### How it Works

1. When setting up an integration in n8n:
   - User initiates OAuth connection
   - Service (e.g., Slack) redirects to our callback with a temporary code
   - Our endpoint exchanges this code for permanent access tokens
   - n8n stores these tokens for future operations

2. The endpoint is only used during:
   - Initial authorization
   - Reauthorization if tokens expire or are revoked
   - Setting up new OAuth-based integrations

### Slack Integration Notes

Slack's OAuth implementation requires a specific flow:

1. First OAuth exchange:
   - Returns both bot token (`xoxb-`) and user token (`xoxp-`)
   - Each token type has different permissions

2. n8n credential setup:
   - Use the User OAuth Token (`xoxp-`) for actions requiring user permissions
   - Required for operations like channel management and message posting

The endpoint is designed to handle future n8n OAuth integrations (GitHub, Google, etc.) using the same callback path.

# Altiverr Webhook Relay

This service provides a generic OAuth relay for n8n workflows, allowing authentication with multiple services through a single callback URL.

## Supported OAuth Providers

- **Google** - For Google Sheets and other Google API integrations
- **Slack** - For Slack API integrations

## How It Works

The webhook relay provides a unified OAuth callback endpoint that handles authentication for different providers. When used with n8n, you can configure the OAuth credential to use the following callback URL:

```
https://altiverr-webhook-relay.vercel.app/api/oauth2/rest/oauth2-credential/callback
```

The system will automatically detect which provider is being used based on the incoming callback data and handle the OAuth token exchange appropriately.

## Adding New OAuth Providers

To add a new OAuth provider:

1. Edit `api/oauth2/rest/oauth2-credential/callback.js` and add the provider to the `PROVIDERS` object:

```javascript
const PROVIDERS = {
  // Existing providers...
  
  newprovider: {
    name: 'New Provider',
    tokenUrl: 'https://provider.com/oauth/token',
    authUrl: 'https://provider.com/oauth/authorize',
    clientIdEnv: 'NEW_PROVIDER_CLIENT_ID',
    clientSecretEnv: 'NEW_PROVIDER_CLIENT_SECRET',
    supportsPkce: true, // Whether the provider supports PKCE
    requiresPkce: false, // Whether PKCE is required
    defaultScopes: ['scope1', 'scope2'] // Default scopes to request
  }
}
```

2. Update the `detectProvider` function to identify the new provider from callback parameters or state data.

3. Add provider-specific error handling and recommendations in the error response section.

## Authentication Debugging

The system includes a debug endpoint that shows authentication URLs for all configured providers:

```
https://altiverr-webhook-relay.vercel.app/api/oauth2/rest/oauth2-credential/callback?debug=auth_urls
```

## Environment Variables

The following environment variables are required:

- `GOOGLE_CLIENT_ID` - Google OAuth client ID
- `GOOGLE_CLIENT_SECRET` - Google OAuth client secret
- `SLACK_CLIENT_ID` - Slack OAuth client ID
- `SLACK_CLIENT_SECRET` - Slack OAuth client secret

## OAuth Configuration Notes

### Google

1. Create a project in Google Cloud Console
2. Enable required APIs (Google Sheets API, Google Drive API)
3. Configure the OAuth consent screen
4. Create OAuth credentials and add the redirect URL
5. Set the required environment variables

### Slack

1. Create a Slack App at api.slack.com
2. Add the redirect URL to your app configuration
3. Add required scopes to your app
4. Set the required environment variables

## Webhook Proxy Development

The webhook relay system includes a local proxy component that runs on your MacBook to forward messages from AWS SNS to n8n. During development, you can run this proxy in development mode to automatically reload when files change.

### Running the Proxy in Development Mode

1. First, unload the service if it's running:
```bash
launchctl unload ~/Library/LaunchAgents/com.altiverr.webhook-proxy.plist
```

2. Navigate to the proxy directory and run in development mode:
```bash
cd proxy && npm run dev
```

3. The proxy will now automatically restart whenever you make changes to any files in the proxy directory.

4. When you're done developing, you can reload the service for production mode:
```bash
launchctl load ~/Library/LaunchAgents/com.altiverr.webhook-proxy.plist
```

For more detailed instructions, see the proxy README in the `proxy/` directory.

### Checking Status

```bash
# Check if services are running
launchctl list | grep altiverr

# Check logs
tail -f logs/proxy.log
```

### Testing Webhook Delivery

To test if your webhook relay system is working correctly, you can use the built-in test scripts:

#### Test Local Webhook Delivery

This sends a test webhook directly to your local proxy (bypassing the tunnel):

```bash
npm run test-local
```

#### Test Tunnel Webhook Delivery

This sends a test webhook through your Cloudflare tunnel (simulating an actual webhook from AWS):

```bash
npm run test-tunnel
```

Both tests will:
- Verify the required services are running
- Send a mock SNS message with test data
- Report the results of the delivery attempt

### Switching Between Modes

## Webhook Endpoints

### Slack Integration

The webhook relay service now supports Slack webhooks. When configuring your Slack app, you can use the following URL patterns:

#### Production Deployment Flow

Here's how the Slack webhook flow works in production:

1. **Vercel Deployment**: The webhook relay service is deployed to Vercel
2. **n8n Configuration**: n8n is configured with a webhook node
3. **Slack Configuration**: Slack app is configured to send events to your Vercel-deployed webhook endpoint
4. **Event Flow**:
   - Slack sends webhooks to Vercel
   - Vercel processes and publishes to SNS
   - Your local proxy receives messages from SNS via your Cloudflare tunnel
   - n8n receives the normalized event from your local proxy

#### For n8n Integration

When setting up in production:

1. Create a webhook node in n8n
2. **IMPORTANT**: For your Slack app configuration, use your Vercel deployment URL:
   - Production: `https://altiverr-webhook-relay.vercel.app/webhook/{uuid}/webhook`
   - Where `{uuid}` is the unique identifier shown in your n8n webhook URL
   - Example: `https://altiverr-webhook-relay.vercel.app/webhook/09210404-b3f7-48c7-9cd2-07f922bc4b14/webhook`

3. When configuring your Slack app:
   - Go to "Event Subscriptions" in your Slack app settings
   - Enable events
   - Enter your Vercel URL (NOT the localhost URL shown in n8n)
   - Subscribe to the following bot events:
     - `message.channels` (for messages in public channels)
     - `message.groups` (for messages in private channels if needed)
   - Verify the URL passes Slack's verification check
   - Save your changes

4. Set the following environment variables in your Vercel deployment:
   ```
   SLACK_SIGNING_SECRET=<your-slack-signing-secret>
   SLACK_APP_ID=<your-slack-app-id>
   AWS_ACCESS_KEY_ID=<your-aws-access-key>
   AWS_SECRET_ACCESS_KEY=<your-aws-secret-key>
   AWS_REGION=us-west-1
   SNS_TOPIC_ARN=<your-sns-topic-arn>
   ```

#### Local Development Testing

For testing purposes during development, you can use:

```bash
# Test with your local server (won't reach Slack)
npm run test-slack

# Test with your Cloudflare tunnel
npm run test-slack-tunnel
```

The webhook relay will:
1. Verify the request using Slack's signature verification
2. Normalize the data into a consistent format
3. Add metadata to track the source and processing
4. Publish the event to your configured SNS topic
5. Your local proxy will receive the message from SNS and forward to n8n

No additional SNS topics are required - the same topic can handle messages from different sources as the payloads are normalized with source identification.

#### Slack URL Verification

When you add a new URL to your Slack app's Event Subscriptions, Slack will:

1. Send a GET request to verify the URL is accessible
2. Send a POST request with a `url_verification` event containing a challenge parameter

The webhook relay handles both verification methods:

- GET requests are acknowledged with a 200 OK response
- POST `url_verification` events are automatically responded to with the challenge value

This ensures that Slack can successfully verify your webhook URL during setup.

#### Legacy URL Formats

For backward compatibility, the system also supports these legacy URL formats:

- `/api/slack-webhook/{uuid}` - An older format for Slack webhooks

If you have existing integrations using these formats, they will continue to work. However, for new setups, we recommend using the standard formats described above.

### Webhook Routing Issues

If you're experiencing webhook routing issues between Slack and Calendly, follow these steps:

#### In n8n

1. **Use separate dedicated webhook nodes**:
   - Create a separate webhook node specifically for Slack 
   - Create a separate webhook node specifically for Calendly
   - Do NOT reuse the same webhook node URL for both services

2. **Configure each webhook with clear identification**:
   - For Slack: Use the path `/webhook/{uuid}/webhook` where `{uuid}` is provided by n8n
   - For Calendly: Use the path `/webhook-test/calendly` or `/webhook/calendly`

3. **Testing routes individually**:
   ```bash
   # Test Slack webhook routing
   npm run test-slack
   
   # Test Calendly webhook routing
   npm run test-calendly
   ```

#### In Slack and Calendly

1. **Use correct webhook URLs in each service**:
   - In Slack App settings: Use only the dedicated Slack webhook URL
   - In Calendly settings: Use only the dedicated Calendly webhook URL

2. **Check logs for routing issues**:
   If you see messages being misrouted, the logs will show which service was detected:
   ```
   Webhook type detected: slack|calendly|unknown
   ```

## Proxy Monitor UI

A local-only UI for monitoring the proxy is included in this project. The UI is designed for local use only and is not deployed to Vercel along with the API.

### Features

- Real-time proxy status monitoring
- Live log viewer with filtering capabilities
- Configuration viewer
- Proxy mode switching between development and production
- Proxy restart functionality

### Running with UI

```bash
# Build the client and start the proxy
./start-with-ui.sh

# Access the UI at
http://localhost:3333/monitor
```

### Building the UI separately

```bash
# Just build the UI (without starting the proxy)
./build-client.sh
```

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
   chmod +x direct-slack-webhook.js sns-slack-webhook.js
   ```

## Usage

### Testing Direct Slack Webhooks

This simulates a Slack webhook coming directly to your webhook service:

```
./direct-slack-webhook.js
```

When run without arguments, this will use real Slack message data from production logs with updated timestamps. This is perfect for testing workflows with realistic data.

To use a custom message instead:

```
./direct-slack-webhook.js "Your custom message text here"
```

If you have issues running with `./`, you can also use:

```
node direct-slack-webhook.js
```

### Testing SNS-Wrapped Slack Webhooks

This simulates a Slack webhook wrapped in an AWS SNS notification format:

```
./sns-slack-webhook.js
```

When run without arguments, this will use a real SNS message structure from production logs with updated timestamps. This gives you a perfect replica of what your system receives from AWS SNS.

To use a custom message instead:

```
./sns-slack-webhook.js "Your custom message text here"
```

If you have issues running with `./`, you can also use:

```
node sns-slack-webhook.js
```

## How to Use with n8n

1. Start your local webhook proxy service in development mode:
   ```
   cd proxy
   pm2 start ecosystem.config.cjs --only webhook-proxy-dev
   pm2 start webhook-proxy-tunnel
   ```

2. Put your n8n workflow in "test" mode with the Slack trigger node active

3. Run one of these test scripts to send a simulated webhook

4. The webhook will be processed by your proxy service and forwarded to n8n

5. Your workflow should trigger, allowing you to build and test the conditions following the trigger

## Real Message Data

Both scripts contain actual production webhook data taken from logs, making them ideal for testing workflows with realistic data structures. The only modifications to the original messages are:

- Updated timestamps (to ensure messages are seen as new/unique)
- Randomized message IDs (to prevent duplication)

Everything else matches what you would receive in production.

## Configuration

You can modify the configuration at the top of each script to change:

- Webhook URLs
  - Direct Slack webhooks: `http://localhost:3333/webhook/slack`
  - SNS-wrapped webhooks: `http://localhost:3333/api/webhook/slack`
- Team/channel/user IDs
- Default message text
- SNS topic ARN (for the SNS-wrapped version)

## Troubleshooting

If the scripts aren't working:

1. Check that your webhook proxy service is running in development mode
   ```
   pm2 list
   ```
   You should see `webhook-proxy-dev` and `webhook-proxy-tunnel` with status `online`

2. Verify the webhook URLs in the script match your local service endpoints

3. Check the console output for any error messages

4. Look at the proxy service logs for detailed processing information
   ```
   pm2 logs webhook-proxy-dev
   ```

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