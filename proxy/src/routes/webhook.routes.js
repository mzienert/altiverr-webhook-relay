import express from 'express';
import snsController from '../controllers/sns.controller.js';

const router = express.Router();

// SNS message handler - AWS expects this path
router.post('/sns', snsController.handleSnsMessage);

// Add Calendly webhooks route for internal routing 
router.post('/api/webhook/calendly', snsController.handleSnsMessage);

// Add Slack webhooks route for internal routing
router.post('/api/webhook/slack', snsController.handleSnsMessage);

export default router; 