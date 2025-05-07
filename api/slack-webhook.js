// Main webhook relay handler for Slack to n8n
// This is kept for backward compatibility and to catch direct hits,
// but the main functionality is now in /api/slack-webhook/[webhookId]/index.js

export default function handler(req, res) {
  // Redirect to the nested webhook endpoints
  return res.status(400).json({
    error: 'Invalid URL format',
    message: 'Please use the format: /api/slack-webhook/{webhookId}',
    example: '/api/slack-webhook/f939a053-cc02-4c1e-9334-b83686933ff1',
    info: 'The Slack webhook relay has been updated to use dynamic routes'
  });
} 