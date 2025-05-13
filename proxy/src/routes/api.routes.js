import express from 'express';
import env from '../../config/env.js';
import { getWebhookUrl } from '../utils/webhookUrl.js';
import responder from '../utils/responder.js';

const router = express.Router();

// API routes for internal use
router.get('/api', (req, res) => {
  responder.success(res, 200, {
    name: 'Altiverr Webhook Proxy API',
    version: '1.0.0',
    endpoints: {
      '/api': 'API documentation',
      '/api/webhook/calendly': 'Calendly webhook endpoint',
      '/api/webhook/slack': 'Slack webhook endpoint',
      '/webhook-test/:uuid/webhook': 'n8n development webhook URL pattern',
      '/webhook/:uuid/webhook': 'n8n production webhook URL pattern'
    }
  });
});

// Documentation route
router.get('/', (req, res) => {
  // Get the currently active webhook URL based on environment
  const currentWebhookUrl = getWebhookUrl();
  
  responder.success(res, 200, {
    name: 'Altiverr Webhook Proxy',
    version: '1.0.0',
    endpoints: {
      '/': 'API documentation',
      '/health': 'Health check endpoint',
      '/ready': 'Readiness check endpoint',
      '/sns': 'SNS message handler (AWS)',
      '/api/webhook/calendly': 'Calendly webhook endpoint (Internal)',
      '/api/webhook/slack': 'Slack webhook endpoint (Internal)',
      '/webhook-test/:uuid/webhook': 'n8n development webhook URL pattern',
      '/webhook/:uuid/webhook': 'n8n production webhook URL pattern'
    },
    config: {
      publicUrl: env.server.publicUrl,
      n8nWebhookUrl: currentWebhookUrl
    }
  });
});

export default router; 