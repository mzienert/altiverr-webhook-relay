// Base handler for Slack webhook relay
// Used for root level endpoint

export default function handler(req, res) {
  // Provide helpful error message
  return res.status(400).json({
    error: 'Missing webhook ID',
    message: 'Please use the format: /api/slack-webhook/{webhookId}',
    example: '/api/slack-webhook/f939a053-cc02-4c1e-9334-b83686933ff1'
  });
} 