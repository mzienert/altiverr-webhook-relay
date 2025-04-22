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