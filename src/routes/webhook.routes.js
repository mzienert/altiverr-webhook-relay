import express from 'express';
import calendlyController from '../controllers/calendly.controller.js';
import slackController from '../controllers/slack.controller.js';
import { createWebhookAuthMiddleware } from '../middlewares/webhookAuth.js';
import { verifyCalendlySignature } from '../services/calendly.service.js';
import { verifySlackSignature } from '../services/slack.service.js';
// Removed n8n service import - SNS processing now handled by proxy service only
import logger from '../utils/logger.js';
import responder from '../utils/responder.js';
import { detectWebhookType, detectWebhookFromRequest } from '../../shared/utils/webhookDetector.js';

const router = express.Router();

// Create authentication middleware for each service
const calendlyAuthMiddleware = createWebhookAuthMiddleware(verifyCalendlySignature);
const slackAuthMiddleware = createWebhookAuthMiddleware(verifySlackSignature);

// Calendly webhook route
router.post('/calendly', calendlyAuthMiddleware, calendlyController.handleCalendlyWebhook);

// Slack webhook route
router.post('/slack', slackAuthMiddleware, slackController.handleSlackWebhook);

/**
 * Handle webhook verification (GET requests)
 * Some services send GET requests to verify webhook endpoints
 */
const handleWebhookVerification = (req, res) => {
  logger.info('Webhook verification request received', {
    path: req.path,
    query: req.query,
    userAgent: req.headers['user-agent']
  });
  
  return responder.success(res, 200, { verified: true }, 'Webhook endpoint verified');
};

// n8n specific webhook routes with UUID pattern - exact match to n8n URLs
// Format: /webhook-test/{uuid}/webhook (development)
router.post('-test/:uuid/webhook', (req, res) => {
  logger.info('Received webhook from n8n development URL', {
    uuid: req.params.uuid,
    path: req.path
  });
  
  // Use improved webhook type detection with enhanced logging
  const detection = detectWebhookFromRequest(req);
  
  logger.info(`Webhook detected: ${detection.type} (confidence: ${detection.confidence})`, {
    uuid: req.params.uuid,
    type: detection.type,
    confidence: detection.confidence,
    indicators: detection.indicators,
    details: detection.details
  });
  
  if (detection.type === 'slack') {
    return slackController.handleSlackWebhook(req, res);
  } else if (detection.type === 'calendly') {
    return calendlyController.handleCalendlyWebhook(req, res);
  } else {
    // Forward to generic handler for unidentified webhooks
    routeWebhookBasedOnPayload(req, res);
  }
});

// Add GET method for URL verification on development URL
router.get('-test/:uuid/webhook', handleWebhookVerification);

// Format: /{uuid}/webhook (production)
router.post('/:uuid/webhook', (req, res) => {
  logger.info('Received webhook from n8n production URL', {
    uuid: req.params.uuid,
    path: req.path
  });
  
  // Use improved webhook type detection with enhanced logging
  const detection = detectWebhookFromRequest(req);
  
  logger.info(`Webhook detected: ${detection.type} (confidence: ${detection.confidence})`, {
    uuid: req.params.uuid,
    type: detection.type,
    confidence: detection.confidence,
    indicators: detection.indicators,
    details: detection.details
  });
  
  if (detection.type === 'slack') {
    return slackController.handleSlackWebhook(req, res);
  } else if (detection.type === 'calendly') {
    return calendlyController.handleCalendlyWebhook(req, res);
  } else {
    // Forward to generic handler for unidentified webhooks
    routeWebhookBasedOnPayload(req, res);
  }
});

// Add GET method for URL verification on production URL
router.get('/:uuid/webhook', handleWebhookVerification);

// Root webhook handler - for compatibility with Calendly and other webhooks that might not specify a subpath
router.post('/', (req, res) => {
  logger.info('Received webhook at root webhook path, attempting to route based on headers or payload');
  
  // Route based on payload
  routeWebhookBasedOnPayload(req, res);
});

// Add GET method for root webhook URL verification
router.get('/', handleWebhookVerification);

/**
 * Helper function to route webhooks based on payload/headers
 * This is the legacy approach, used as fallback
 */
function routeWebhookBasedOnPayload(req, res) {
  // Use centralized detection with fallback for backward compatibility
  const detection = detectWebhookFromRequest(req);
  
  logger.info('Legacy webhook routing with centralized detection', {
    type: detection.type,
    confidence: detection.confidence,
    details: detection.details
  });
  
  if (detection.type === 'slack') {
    logger.info('Detected Slack webhook, forwarding to Slack handler');
    return slackController.handleSlackWebhook(req, res);
  }
  
  if (detection.type === 'calendly') {
    logger.info('Detected Calendly webhook, forwarding to Calendly handler');
    return calendlyController.handleCalendlyWebhook(req, res);
  }
  
  // DEFAULT - Log details to help troubleshoot misrouting
  logger.warn('Webhook type could not be determined with centralized detector', {
    userAgent: req.headers['user-agent'],
    contentType: req.headers['content-type'],
    path: req.path,
    bodyKeys: Object.keys(req.body || {}).join(','),
    bodyType: req.body?.type,
    bodyEvent: req.body?.event,
    detectionResult: detection
  });
  
  // Default response if we can't determine the webhook source
  return responder.success(res, 202, { 
    received: true, 
    timestamp: new Date().toISOString(),
    detection: detection
  }, 'Webhook received but source could not be determined');
}

// Catch-all route for webhook documentation
router.get('/', (req, res) => {
  responder.success(res, 200, {
    endpoints: {
      '/webhook/calendly': 'Endpoint for Calendly webhooks',
      '/webhook/slack': 'Endpoint for Slack webhooks',
      '/webhook': 'Generic webhook endpoint with source detection',
      '/webhook-test/{uuid}/webhook': 'n8n development webhook endpoint',
      '/{uuid}/webhook': 'n8n production webhook endpoint'
    },
    version: '1.0.0'
  }, 'Webhook API');
});

// Add specific Calendly test endpoint 
router.post('-test/calendly', calendlyAuthMiddleware, (req, res) => {
  logger.info('Received Calendly webhook on dedicated n8n test endpoint');
  // Force to use Calendly handler directly
  return calendlyController.handleCalendlyWebhook(req, res);
});

// Add GET method for Calendly test endpoint
router.get('-test/calendly', (req, res) => {
  logger.info('Received GET verification for Calendly test webhook');
  return responder.success(res, 200, {}, 'Calendly test webhook endpoint is active');
});

// Add specific Calendly production endpoint
router.post('/calendly', calendlyAuthMiddleware, (req, res) => {
  logger.info('Received Calendly webhook on dedicated webhook endpoint');
  // Force to use Calendly handler directly
  return calendlyController.handleCalendlyWebhook(req, res);
});

// Add GET method for Calendly production endpoint
router.get('/calendly', (req, res) => {
  logger.info('Received GET verification for Calendly webhook');
  return responder.success(res, 200, {}, 'Calendly webhook endpoint is active');
});

export default router; 