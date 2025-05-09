import express from 'express';
import webhookRoutes from './webhook.routes.js';

const router = express.Router();

// API information route
router.get('/', (req, res) => {
  res.status(200).json({
    name: 'Altiverr Webhook Relay API',
    version: '1.0.0',
    status: 'active',
    timestamp: new Date().toISOString()
  });
});

// Register route modules
router.use('/webhook', webhookRoutes);

export default router; 