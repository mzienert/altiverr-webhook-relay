import logger from '../utils/logger.js';
import env from '../config/env.js';
import responder from '../utils/responder.js';

/**
 * Not found error handler - for non-existent routes
 */
export function notFoundHandler(req, res, next) {
  const error = new Error(`Route not found: ${req.originalUrl}`);
  error.statusCode = 404;
  next(error);
}

/**
 * Global error handler middleware
 */
export function errorHandler(err, req, res, next) {
  const statusCode = err.statusCode || 500;
  
  // Log the error
  if (statusCode === 500) {
    logger.error(`[${req.method}] ${req.path} >> ${err.message}`, {
      stack: env.api.env === 'development' ? err.stack : undefined,
      statusCode,
      path: req.path,
      method: req.method,
      query: req.query,
      body: statusCode === 500 ? undefined : req.body // Don't log body for server errors
    });
  } else {
    logger.warn(`[${req.method}] ${req.path} >> ${err.message}`, {
      statusCode,
      path: req.path,
      method: req.method
    });
  }
  
  // Send error response using responder
  const details = env.api.env === 'development' && statusCode === 500 ? { stack: err.stack } : {};
  
  return responder.error(res, statusCode, err.message, details);
}

export default {
  notFoundHandler,
  errorHandler
}; 