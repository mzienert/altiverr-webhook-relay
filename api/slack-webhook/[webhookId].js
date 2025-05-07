// Webhook relay handler for Slack to n8n with dynamic path parameters
const axios = require('axios');
const crypto = require('crypto');

// Environment variables
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || 'http://localhost:5678/webhook/';

export default async function handler(req, res) {
  // Only allow POST method
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('Received Slack webhook payload');
    
    // Get the raw body from the request
    const payload = req.body;
    
    // Handle Slack URL verification challenge
    if (payload.type === 'url_verification') {
      console.log('Handling Slack URL verification challenge');
      return res.status(200).json({ challenge: payload.challenge });
    }
    
    // Generate a unique ID for tracking
    const requestId = crypto
      .createHash('sha256')
      .update(`${Date.now()}-${Math.random()}`)
      .digest('hex')
      .substring(0, 12);
      
    console.log(`[${requestId}] Processing Slack webhook`);
    
    // Get the webhook ID from the URL path parameter
    const webhookId = req.query.webhookId;
    
    if (!webhookId) {
      console.error(`[${requestId}] No webhook ID found in URL`);
      return res.status(400).json({ error: 'Webhook ID is required' });
    }
    
    console.log(`[${requestId}] Webhook ID: ${webhookId}`);
    
    // Construct the target URL - ensure trailing slash is handled correctly
    let targetUrl = N8N_WEBHOOK_URL;
    if (!targetUrl.endsWith('/')) {
      targetUrl += '/';
    }
    targetUrl += webhookId;
    
    // Check if we need to add "/webhook" suffix based on n8n's URL format
    if (!targetUrl.endsWith('/webhook')) {
      targetUrl += '/webhook';
    }
    
    console.log(`[${requestId}] Forwarding to: ${targetUrl}`);
    
    // Forward the request with all headers and body
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