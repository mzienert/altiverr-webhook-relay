import express from 'express';
import healthRoutes from './health.routes.js';
import webhookRoutes from './webhook.routes.js';
import apiRoutes from './api.routes.js';
import debugRoutes from './debug.routes.js';
import { notFoundHandler } from '../middleware/errorHandler.js';

const router = express.Router();

// Combine all route modules
router.use('/', healthRoutes);
router.use('/', webhookRoutes);
router.use('/', apiRoutes);
router.use('/', debugRoutes);

// Handle 404 errors for any undefined routes (MUST BE LAST)
router.use(notFoundHandler);

export default router; 