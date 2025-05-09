import express from 'express';
import calendlyController from '../controllers/calendly.controller.js';
import { createWebhookAuthMiddleware } from '../middlewares/webhookAuth.js';
import { verifyCalendlySignature } from '../services/calendly.service.js';

const router = express.Router();

// Create Calendly specific authentication middleware
const calendlyAuthMiddleware = createWebhookAuthMiddleware(verifyCalendlySignature);

// Calendly webhook route
router.post('/calendly', calendlyAuthMiddleware, calendlyController.handleCalendlyWebhook);

// Catch-all route for webhook documentation
router.get('/', (req, res) => {
  res.status(200).json({
    message: 'Webhook API',
    endpoints: {
      '/webhook/calendly': 'Endpoint for Calendly webhooks'
    },
    version: '1.0.0'
  });
});

export default router; 