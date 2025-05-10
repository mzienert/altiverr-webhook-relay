import logger from '../utils/logger.js';
import { sendErrorNotification } from '../services/notification.service.js';
import responder from '../utils/responder.js';

/**
 * Global error handling middleware
 */
export const errorHandler = (err, req, res, next) => {
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method
  });
  
  // Send error notification for server errors
  sendErrorNotification('Unhandled server error', {
    error: err.message,
    path: req.path,
    method: req.method
  });
  
  return responder.error(res, 500, 'Internal server error', { message: err.message });
};

/**
 * 404 handler for undefined routes
 */
export const notFoundHandler = (req, res) => {
  logger.warn(`${req.method} ${req.path} >> Route not found`, {
    statusCode: 404,
    path: req.path,
    method: req.method
  });
  
  return responder.notFound(res, `Route not found: ${req.path}`);
}; 