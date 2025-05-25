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
      '/sns': 'SNS message handler (AWS) - forwards to n8n',
      '/api/webhook/calendly': 'Calendly webhook fallback endpoint',
      '/api/webhook/slack': 'Slack webhook fallback endpoint'
    },
    architecture: {
      primary_flow: 'External Service → API Service → SNS → Proxy Service → n8n',
      proxy_role: 'Receives SNS notifications and forwards to n8n',
      api_service: 'External webhook receiver (separate service)'
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
    description: 'SNS to n8n forwarding service',
    endpoints: {
      '/': 'API documentation',
      '/health': 'Health check endpoint',
      '/ready': 'Readiness check endpoint',
      '/sns': 'SNS message handler (AWS) - forwards to n8n',
      '/api/webhook/calendly': 'Calendly webhook fallback endpoint',
      '/api/webhook/slack': 'Slack webhook fallback endpoint'
    },
    config: {
      publicUrl: env.server.publicUrl,
      n8nWebhookUrl: currentWebhookUrl
    },
    architecture: {
      role: 'Proxy Service - SNS to n8n forwarding',
      flow: 'SNS → Proxy → n8n',
      note: 'External webhooks should go to the API service, not this proxy'
    }
  });
});

export default router; 