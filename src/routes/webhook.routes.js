import express from 'express';
import calendlyController from '../controllers/calendly.controller.js';
import slackController from '../controllers/slack.controller.js';
import { createWebhookAuthMiddleware } from '../middlewares/webhookAuth.js';
import { verifyCalendlySignature } from '../services/calendly.service.js';
import { verifySlackSignature } from '../services/slack.service.js';
import logger from '../utils/logger.js';

const router = express.Router();

// Create authentication middleware for each service
const calendlyAuthMiddleware = createWebhookAuthMiddleware(verifyCalendlySignature);
const slackAuthMiddleware = createWebhookAuthMiddleware(verifySlackSignature);

// Calendly webhook route
router.post('/calendly', calendlyAuthMiddleware, calendlyController.handleCalendlyWebhook);

// Slack webhook route
router.post('/slack', slackAuthMiddleware, slackController.handleSlackWebhook);

// n8n specific webhook routes with UUID pattern - exact match to n8n URLs
// Format: /webhook-test/{uuid}/webhook (development)
router.post('-test/:uuid/webhook', (req, res) => {
  logger.info('Received webhook from n8n development URL', {
    uuid: req.params.uuid
  });
  
  // Forward to appropriate handler based on signatures/payload
  routeWebhookBasedOnPayload(req, res);
});

// Format: /{uuid}/webhook (production)
router.post('/:uuid/webhook', (req, res) => {
  logger.info('Received webhook from n8n production URL', {
    uuid: req.params.uuid
  });
  
  // Forward to appropriate handler based on signatures/payload
  routeWebhookBasedOnPayload(req, res);
});

// Root webhook handler - for compatibility with Calendly and other webhooks that might not specify a subpath
router.post('/', (req, res) => {
  logger.info('Received webhook at root webhook path, attempting to route based on headers or payload');
  
  // Route based on payload
  routeWebhookBasedOnPayload(req, res);
});

/**
 * Helper function to route webhooks based on payload/headers
 */
function routeWebhookBasedOnPayload(req, res) {
  // Check for Slack webhook signatures
  const isSlack = req.headers['x-slack-signature'] || 
                  req.body?.type === 'event_callback' ||
                  req.body?.type === 'url_verification';
  
  if (isSlack) {
    logger.info('Detected Slack webhook, forwarding to Slack handler');
    return slackController.handleSlackWebhook(req, res);
  }
  
  // Check if it's a Calendly webhook based on headers or payload
  const isCalendly = req.headers['user-agent']?.includes('Calendly') || 
                     req.body?.event?.includes('calendly');
  
  if (isCalendly) {
    logger.info('Detected Calendly webhook, forwarding to Calendly handler');
    return calendlyController.handleCalendlyWebhook(req, res);
  }
  
  // Default response if we can't determine the webhook source
  logger.warn('Received webhook but could not determine source', {
    headers: req.headers,
    body: req.body,
    path: req.path
  });
  
  return res.status(202).json({
    message: 'Webhook received but source could not be determined',
    received: true,
    timestamp: new Date().toISOString()
  });
}

// Catch-all route for webhook documentation
router.get('/', (req, res) => {
  res.status(200).json({
    message: 'Webhook API',
    endpoints: {
      '/webhook/calendly': 'Endpoint for Calendly webhooks',
      '/webhook/slack': 'Endpoint for Slack webhooks',
      '/webhook': 'Generic webhook endpoint with source detection',
      '/webhook-test/{uuid}/webhook': 'n8n development webhook endpoint',
      '/{uuid}/webhook': 'n8n production webhook endpoint'
    },
    version: '1.0.0'
  });
});

export default router; 