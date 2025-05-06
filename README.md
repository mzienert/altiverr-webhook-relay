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