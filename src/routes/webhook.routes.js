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

// Function to handle GET requests for webhook verification
const handleWebhookVerification = (req, res) => {
  logger.info(`Received verification GET request for: ${req.path}`, {
    uuid: req.params.uuid,
    query: req.query
  });
  
  // Return a 200 OK with minimal response
  // This allows Slack to verify the URL and n8n to check health
  return res.status(200).json({
    success: true,
    message: 'Webhook endpoint is active'
  });
};

/**
 * More precise detection of webhook types
 * Returns 'slack', 'calendly', or null
 */
function detectWebhookType(req) {
  // SLACK DETECTION - multiple strong indicators
  if (
    // Header-based detection (strongest)
    req.headers['x-slack-signature'] ||
    req.headers['x-slack-request-timestamp'] ||
    
    // Payload-based detection (strong)
    req.body?.type === 'event_callback' ||
    req.body?.type === 'url_verification' ||
    
    // User agent detection (weaker)
    req.headers['user-agent']?.includes('Slackbot')
  ) {
    return 'slack';
  }
  
  // CALENDLY DETECTION - multiple strong indicators
  if (
    // Header-based detection (strong)
    req.headers['calendly-webhook-signature'] ||
    
    // Payload-based detection (strong)
    req.body?.event === 'invitee.created' ||
    req.body?.event === 'invitee.canceled' ||
    
    // Structure-based detection
    (req.body?.event && req.body?.payload?.event_type?.uri) ||
    
    // User agent detection (weaker, but specific)
    req.headers['user-agent']?.includes('Calendly')
  ) {
    return 'calendly';
  }
  
  // Could not determine with confidence
  return null;
}

// n8n specific webhook routes with UUID pattern - exact match to n8n URLs
// Format: /webhook-test/{uuid}/webhook (development)
router.post('-test/:uuid/webhook', (req, res) => {
  logger.info('Received webhook from n8n development URL', {
    uuid: req.params.uuid,
    path: req.path
  });
  
  // Use improved webhook type detection
  const webhookType = detectWebhookType(req);
  
  logger.info(`Webhook type detected: ${webhookType || 'unknown'}`, {
    uuid: req.params.uuid,
    userAgent: req.headers['user-agent'],
    contentType: req.headers['content-type'],
    payloadType: req.body?.type,
    payloadEvent: req.body?.event
  });
  
  if (webhookType === 'slack') {
    return slackController.handleSlackWebhook(req, res);
  } else if (webhookType === 'calendly') {
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
  
  // Use improved webhook type detection
  const webhookType = detectWebhookType(req);
  
  logger.info(`Webhook type detected: ${webhookType || 'unknown'}`, {
    uuid: req.params.uuid,
    userAgent: req.headers['user-agent'],
    contentType: req.headers['content-type'],
    payloadType: req.body?.type,
    payloadEvent: req.body?.event
  });
  
  if (webhookType === 'slack') {
    return slackController.handleSlackWebhook(req, res);
  } else if (webhookType === 'calendly') {
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
  
  // DEFAULT - Log details to help troubleshoot misrouting
  logger.warn('Webhook type could not be determined', {
    userAgent: req.headers['user-agent'],
    contentType: req.headers['content-type'],
    path: req.path,
    bodyKeys: Object.keys(req.body || {}).join(','),
    bodyType: req.body?.type,
    bodyEvent: req.body?.event
  });
  
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

// Add specific Calendly test endpoint 
router.post('-test/calendly', calendlyAuthMiddleware, (req, res) => {
  logger.info('Received Calendly webhook on dedicated n8n test endpoint');
  // Force to use Calendly handler directly
  return calendlyController.handleCalendlyWebhook(req, res);
});

// Add GET method for Calendly test endpoint
router.get('-test/calendly', (req, res) => {
  logger.info('Received GET verification for Calendly test webhook');
  return res.status(200).json({
    success: true,
    message: 'Calendly test webhook endpoint is active'
  });
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
  return res.status(200).json({
    success: true,
    message: 'Calendly webhook endpoint is active'
  });
});

export default router; 