import express from 'express';
import healthController from '../controllers/health.controller.js';

const router = express.Router();

// Health check routes
router.get('/health', healthController.healthCheck);
router.get('/ready', healthController.readinessCheck);

export default router; 