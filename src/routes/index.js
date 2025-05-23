import express from 'express';
import webhookRoutes from './webhook.routes.js';
import responder from '../utils/responder.js';

const router = express.Router();

// API information route
router.get('/', (req, res) => {
  responder.success(res, 200, {
    name: 'Altiverr Webhook Relay API',
    version: '1.0.0',
    status: 'active',
    timestamp: new Date().toISOString()
  });
});

// Add compatibility route for Calendly webhooks coming to /webhook
router.post('/webhook', (req, res, next) => {
  console.log('Received webhook at /webhook, forwarding to /webhook/calendly');
  req.url = '/webhook/calendly';
  next();
});

// Register route modules
router.use('/webhook', webhookRoutes);

export default router; 