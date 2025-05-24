import express from 'express';
import snsController from '../controllers/sns.controller.js';
import logger from '../utils/logger.js';

const router = express.Router();

// SNS message handler - AWS expects this path
router.post('/sns', snsController.handleSnsMessage);

// Internal routing for webhooks that come from the API service via SNS
router.post('/api/webhook/calendly', snsController.handleSnsMessage);
router.post('/api/webhook/slack', snsController.handleSnsMessage);

// DISABLED: All direct webhook endpoints
// All webhooks should go through the API service and SNS for reliability

// Block direct Slack webhooks  
router.post('/direct/slack', (req, res) => {
  logger.warn('Direct Slack webhook blocked', {
    userAgent: req.headers['user-agent'],
    path: req.path
  });
  
  // Handle URL verification challenges
  if (req.body?.type === 'url_verification' && req.body?.challenge) {
    logger.info('Responding to Slack URL verification challenge');
    return res.status(200).json({
      challenge: req.body.challenge
    });
  }
  
  return res.status(404).json({
    error: 'Direct webhooks not supported',
    message: 'Please configure webhooks to go through the API service instead',
    correctEndpoint: 'https://altiverr-webhook-relay.vercel.app/api/webhook/slack'
  });
});

router.post('/webhook/slack', (req, res) => {
  logger.warn('Direct webhook/slack blocked', {
    userAgent: req.headers['user-agent'],
    path: req.path
  });
  
  return res.status(404).json({
    error: 'Direct webhooks not supported',
    message: 'Please configure webhooks to go through the API service instead',
    correctEndpoint: 'https://altiverr-webhook-relay.vercel.app/api/webhook/slack'
  });
});

// Block n8n direct webhook endpoints
router.post('/webhook-test/:uuid/webhook', (req, res) => {
  logger.warn('Direct n8n test webhook blocked', {
    uuid: req.params.uuid,
    userAgent: req.headers['user-agent'],
    path: req.path
  });
  
  // Handle URL verification challenges
  if (req.body?.type === 'url_verification' && req.body?.challenge) {
    logger.info('Responding to Slack URL verification challenge');
    return res.status(200).json({
      challenge: req.body.challenge
    });
  }
  
  return res.status(404).json({
    error: 'Direct webhooks not supported',
    message: 'Please configure webhooks to go through the API service instead',
    correctEndpoint: 'https://altiverr-webhook-relay.vercel.app/api/webhook/slack'
  });
});

router.post('/webhook/:uuid/webhook', (req, res) => {
  logger.warn('Direct n8n prod webhook blocked', {
    uuid: req.params.uuid,
    userAgent: req.headers['user-agent'],
    path: req.path
  });
  
  // Handle URL verification challenges
  if (req.body?.type === 'url_verification' && req.body?.challenge) {
    logger.info('Responding to Slack URL verification challenge');
    return res.status(200).json({
      challenge: req.body.challenge
    });
  }
  
  return res.status(404).json({
    error: 'Direct webhooks not supported',
    message: 'Please configure webhooks to go through the API service instead',
    correctEndpoint: 'https://altiverr-webhook-relay.vercel.app/api/webhook/slack'
  });
});

router.post('/:uuid/webhook', (req, res) => {
  logger.warn('Direct UUID webhook blocked', {
    uuid: req.params.uuid,
    userAgent: req.headers['user-agent'],
    path: req.path
  });
  
  // Handle URL verification challenges
  if (req.body?.type === 'url_verification' && req.body?.challenge) {
    logger.info('Responding to Slack URL verification challenge');
    return res.status(200).json({
      challenge: req.body.challenge
    });
  }
  
  return res.status(404).json({
    error: 'Direct webhooks not supported',
    message: 'Please configure webhooks to go through the API service instead',
    correctEndpoint: 'https://altiverr-webhook-relay.vercel.app/api/webhook/slack'
  });
});

// GET endpoints for webhook verification (allow these)
router.get('/webhook-test/:uuid/webhook', (req, res) => {
  logger.info('Received verification GET request on n8n dev path', {
    uuid: req.params.uuid
  });
  return res.status(200).json({
    success: true,
    message: 'Webhook endpoint is active'
  });
});

router.get('/webhook/:uuid/webhook', (req, res) => {
  logger.info('Received verification GET request on n8n prod path', {
    uuid: req.params.uuid
  });
  return res.status(200).json({
    success: true,
    message: 'Webhook endpoint is active'
  });
});

router.get('/:uuid/webhook', (req, res) => {
  logger.info('Received verification GET request on direct path', {
    uuid: req.params.uuid
  });
  return res.status(200).json({
    success: true,
    message: 'Webhook endpoint is active'
  });
});

// Calendly endpoints
router.post('/webhook/calendly', (req, res) => {
  logger.warn('Direct Calendly webhook blocked', {
    userAgent: req.headers['user-agent'],
    path: req.path
  });
  
  return res.status(404).json({
    error: 'Direct webhooks not supported',
    message: 'Please configure webhooks to go through the API service instead',
    correctEndpoint: 'https://altiverr-webhook-relay.vercel.app/api/webhook/calendly'
  });
});

router.get('/webhook/calendly', (req, res) => {
  logger.info('Received verification GET request on direct Calendly endpoint');
  return res.status(200).json({
    success: true,
    message: 'Calendly webhook endpoint is active'
  });
});

export default router; 