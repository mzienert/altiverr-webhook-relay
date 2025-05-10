import crypto from 'crypto';
import env from '../config/env.js';
import logger from '../utils/logger.js';

/**
 * Factory function to create a middleware for verifying webhook signatures
 * @param {Function} verifyFn - Custom verification function for a specific provider
 * @returns {Function} Middleware function
 */
export function createWebhookAuthMiddleware(verifyFn) {
  return (req, res, next) => {
    try {
      // Use the provided verification function
      if (verifyFn && typeof verifyFn === 'function') {
        const isValid = verifyFn(req);
        
        if (!isValid) {
          logger.warn('Webhook signature verification failed', {
            path: req.path,
            ip: req.ip
          });
          
          return res.status(401).json({
            error: true,
            message: 'Invalid webhook signature'
          });
        }
      }
      
      // If we reach here, verification passed or was skipped
      next();
    } catch (error) {
      logger.error('Webhook authentication error', { error: error.message });
      next(error);
    }
  };
}

/**
 * General webhook authentication middleware using a shared secret
 * This can be used for webhooks that support a simple shared secret
 */
export function webhookAuthMiddleware(req, res, next) {
  try {
    // Skip verification if no webhook secret is configured
    if (!env.security.webhookSecret) {
      logger.warn('Webhook authentication skipped - no secret configured');
      return next();
    }
    
    // Get authorization header or query parameter
    const providedToken = 
      req.headers['x-webhook-token'] || 
      req.query.token;
    
    if (!providedToken) {
      logger.warn('Missing webhook authentication token', {
        path: req.path,
        ip: req.ip
      });
      
      return res.status(401).json({
        error: true,
        message: 'Authentication token required'
      });
    }
    
    // Use constant-time comparison to prevent timing attacks
    const isValid = crypto.timingSafeEqual(
      Buffer.from(providedToken),
      Buffer.from(env.security.webhookSecret)
    );
    
    if (!isValid) {
      logger.warn('Invalid webhook token', {
        path: req.path,
        ip: req.ip
      });
      
      return res.status(401).json({
        error: true,
        message: 'Invalid authentication token'
      });
    }
    
    // If we reach here, the token is valid
    next();
  } catch (error) {
    logger.error('Webhook authentication error', { error: error.message });
    next(error);
  }
}

export default {
  createWebhookAuthMiddleware,
  webhookAuthMiddleware
}; 