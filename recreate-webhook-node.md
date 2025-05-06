# Manually Updating Slack Webhook in n8n

If the direct database modification doesn't update the webhook URL in n8n, you'll need to manually recreate the webhook node. Here's how:

## Option 1: Update Existing Webhook Node

1. **Backup Your Workflow**
   - Click on the workflow containing the Slack webhook trigger
   - Go to "..." (more menu) → "Export"
   - Save the JSON file as a backup

2. **Update the Webhook Node**
   - Select the Slack webhook trigger node
   - Delete it by pressing Delete or right-click → Delete
   - Add a new "Webhook" node from the nodes panel
   - Configure it with the same settings:
     - **Authentication**: Select the same Slack credential
     - **Method**: POST
     - **Path**: Use the same path or keep it empty
     - **Response Mode**: Choose "Last Node"

3. **Connect the New Node**
   - Connect the new webhook to the next node in your workflow
   - Make sure all node connections are restored

4. **Save and Activate**
   - Click "Save" to save your workflow
   - Toggle the activation switch to activate the workflow

## Option 2: Manual URL Configuration

If the webhook URL is still showing as localhost, try:

1. Go to the Slack App configuration page (api.slack.com)

2. Update the Event Subscriptions URL to:
   ```
   https://altiverr-webhook-relay.vercel.app/api/slack-webhook/YOUR_WEBHOOK_ID
   ```
   Replace `YOUR_WEBHOOK_ID` with the ID from the n8n webhook URL.

3. Slack will verify the URL by sending a challenge request, which our relay will handle automatically.

4. Save the changes in Slack.

## Troubleshooting

If you're still having issues:

1. **Check the logs** of the webhook relay by running:
   ```
   vercel logs
   ```

2. **Test both sides** of the connection:
   - Test the webhook relay with:
     ```
     ./test-slack-webhook.sh YOUR_WEBHOOK_ID challenge
     ```
   - Test n8n's webhook directly with:
     ```
     curl -X POST http://localhost:5678/webhook-test/YOUR_WEBHOOK_ID/webhook -d '{"test":"data"}'
     ```

3. **Verify configuration** in the `api/slack-webhook.js` file to ensure it's correctly forwarding requests to n8n. 