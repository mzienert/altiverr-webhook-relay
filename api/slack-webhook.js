// Webhook relay handler for Slack to n8n
const axios = require('axios').default;
const crypto = require('crypto');

// Environment variables
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || 'http://localhost:5678/webhook/';

module.exports = async function handler(req, res) {
  try {
    console.log('Received request to Slack webhook relay');

    // Handle URL verification for GET requests (used by Slack during setup)
    if (req.method === 'GET') {
      return res.status(200).json({
        message: 'Slack webhook endpoint ready',
        info: 'This endpoint accepts POST requests from Slack webhooks and relays them to n8n'
      });
    }
    
    // Only allow POST for normal operation
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    // Get the payload from the request
    const payload = req.body;
    
    // Handle Slack URL verification challenge
    if (payload && payload.type === 'url_verification') {
      console.log('Handling Slack URL verification challenge');
      return res.status(200).json({ challenge: payload.challenge });
    }
    
    // Extract the webhook ID from the URL
    const urlParts = req.url.split('/');
    // The ID should be the last part of the URL path
    const webhookId = urlParts[urlParts.length - 1];
    
    // Check if we have a webhook ID
    if (!webhookId || webhookId === 'slack-webhook') {
      return res.status(400).json({
        error: 'Missing webhook ID',
        message: 'Please use the format: /api/slack-webhook/{webhookId}'
      });
    }
    
    // Create a request ID for tracking
    const requestId = crypto.randomBytes(6).toString('hex');
    console.log(`[${requestId}] Processing webhook for ID: ${webhookId}`);
    
    // Build the target URL for n8n
    let targetUrl = N8N_WEBHOOK_URL;
    if (!targetUrl.endsWith('/')) {
      targetUrl += '/';
    }
    targetUrl += webhookId;
    
    // Add webhook suffix if needed
    if (!targetUrl.endsWith('/webhook')) {
      targetUrl += '/webhook';
    }
    
    console.log(`[${requestId}] Forwarding to: ${targetUrl}`);
    
    // Forward the request to n8n
    const response = await axios.post(targetUrl, payload, {
      headers: {
        'Content-Type': req.headers['content-type'] || 'application/json',
        'X-Slack-Request-Timestamp': req.headers['x-slack-request-timestamp'],
        'X-Slack-Signature': req.headers['x-slack-signature'],
        'X-Forwarded-By': 'altiverr-webhook-relay'
      }
    });
    
    console.log(`[${requestId}] n8n response status: ${response.status}`);
    
    // Return the response from n8n
    return res.status(response.status).json(response.data);
  } catch (error) {
    console.error('Slack webhook error:', {
      message: error.message,
      code: error.code,
      response: error.response ? {
        status: error.response.status,
        data: error.response.data
      } : 'No response'
    });
    
    return res.status(500).json({ 
      error: 'Failed to forward webhook',
      details: error.message
    });
  }
} 