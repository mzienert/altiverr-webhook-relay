// Catch-all handler for any Slack webhook URL
const axios = require('axios');
const crypto = require('crypto');

// Environment variables
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || 'http://localhost:5678/webhook/';

// Handle all requests to /api/slack-webhook/*
export default async function handler(req, res) {
  try {
    console.log(`Received Slack webhook request to path: ${req.url}`);
    
    // Extract the webhook ID from the URL
    // The slug parameter will be an array of path segments after /api/slack-webhook/catch/
    const path = req.query.slug || [];
    
    // Use the first path segment as the webhook ID
    // If we're using /api/slack-webhook/WEBHOOK_ID, the first segment will be the ID
    const webhookId = path[0];
    
    // Check if we have a valid webhook ID
    if (!webhookId) {
      console.log('No webhook ID provided');
      return res.status(400).json({
        error: 'Missing webhook ID',
        message: 'Please include a webhook ID in the URL'
      });
    }
    
    console.log(`Extracted webhook ID: ${webhookId}`);
    
    // For GET requests - provide info and respond to challenges
    if (req.method === 'GET') {
      return res.status(200).json({
        message: 'Slack webhook endpoint ready',
        webhookId: webhookId
      });
    }
    
    // Only allow POST for webhook events
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }
    
    // Get the raw body and handle Slack URL verification challenge
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
    
    // Construct the target URL for n8n
    let targetUrl = N8N_WEBHOOK_URL;
    if (!targetUrl.endsWith('/')) {
      targetUrl += '/';
    }
    targetUrl += webhookId;
    
    // Check if we need to add "/webhook" suffix
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