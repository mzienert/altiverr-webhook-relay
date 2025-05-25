import express from 'express';
import snsController from '../controllers/sns.controller.js';

const router = express.Router();

// ============================================================================
// PROXY SERVICE - SNS to n8n forwarding only
// ============================================================================

// SNS message handler - AWS expects this path
// This is the main endpoint that receives SNS notifications and forwards to n8n
router.post('/sns', snsController.handleSnsMessage);

// Internal routing for webhooks that come from the API service via SNS
// These are fallback endpoints in case SNS routing needs specific paths
router.post('/api/webhook/calendly', snsController.handleSnsMessage);
router.post('/api/webhook/slack', snsController.handleSnsMessage);

export default router; 