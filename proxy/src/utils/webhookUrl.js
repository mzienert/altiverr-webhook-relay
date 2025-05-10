import env from '../../config/env.js';
import logger from './logger.js';

/**
 * Get the appropriate webhook URL based on the current environment
 * @param {string} path - Optional path to append to the webhook URL (without leading slash)
 * @returns {string} The environment-specific webhook URL
 */
export function getWebhookUrl(path = '') {
  const nodeEnv = process.env.NODE_ENV || 'development';
  let webhookUrl;
  
  if (nodeEnv === 'production') {
    webhookUrl = env.n8n.webhookUrl; // Use production URL
    logger.debug(`Using production webhook URL base: ${webhookUrl}`);
  } else {
    webhookUrl = env.n8n.webhookUrlDev || env.n8n.webhookUrl; // Fall back to production URL if dev not set
    logger.debug(`Using development webhook URL base: ${webhookUrl}`);
  }

  // Log detailed configuration for debugging
  logger.debug('Webhook URL Configuration', {
    nodeEnv,
    configuredUrl: webhookUrl,
    webhookUrlFromEnv: env.n8n.webhookUrl,
    webhookUrlDevFromEnv: env.n8n.webhookUrlDev
  });

  // If path is provided, make sure we don't duplicate path segments
  if (path) {
    // Remove any trailing slash from the webhook URL
    webhookUrl = webhookUrl.replace(/\/+$/, '');
    
    // Remove any leading slash from the path
    const cleanPath = path.replace(/^\/+/, '');
    
    // Combine webhook URL and path
    return `${webhookUrl}/${cleanPath}`;
  }
  
  return webhookUrl;
}

export default {
  getWebhookUrl
}; 