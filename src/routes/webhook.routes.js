import express from 'express';
import calendlyController from '../controllers/calendly.controller.js';
import { createWebhookAuthMiddleware } from '../middlewares/webhookAuth.js';
import { verifyCalendlySignature } from '../services/calendly.service.js';
import logger from '../utils/logger.js';

const router = express.Router();

// Create Calendly specific authentication middleware
const calendlyAuthMiddleware = createWebhookAuthMiddleware(verifyCalendlySignature);

// Calendly webhook route
router.post('/calendly', calendlyAuthMiddleware, calendlyController.handleCalendlyWebhook);

// Root webhook handler - for compatibility with Calendly and other webhooks that might not specify a subpath
router.post('/', (req, res) => {
  logger.info('Received webhook at root webhook path, attempting to route based on headers or payload');
  
  // Check if it's a Calendly webhook based on headers or payload
  const isCalendly = req.headers['user-agent']?.includes('Calendly') || 
                     req.body?.event?.includes('calendly');
  
  if (isCalendly) {
    logger.info('Detected Calendly webhook, forwarding to /calendly handler');
    return calendlyController.handleCalendlyWebhook(req, res);
  }
  
  // Default response if we can't determine the webhook source
  logger.warn('Received webhook at root webhook path but could not determine source', {
    headers: req.headers,
    body: req.body
  });
  
  return res.status(202).json({
    message: 'Webhook received but source could not be determined',
    received: true,
    timestamp: new Date().toISOString()
  });
});

// Catch-all route for webhook documentation
router.get('/', (req, res) => {
  res.status(200).json({
    message: 'Webhook API',
    endpoints: {
      '/webhook/calendly': 'Endpoint for Calendly webhooks',
      '/webhook': 'Generic webhook endpoint with source detection'
    },
    version: '1.0.0'
  });
});

export default router; 