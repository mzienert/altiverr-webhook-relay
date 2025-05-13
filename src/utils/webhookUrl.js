import env from '../../config/env.js';
import logger from './logger.js';

/**
 * Get the appropriate webhook URL based on the current environment and source
 * @param {string} path - Optional path to append to the webhook URL (without leading slash)
 * @param {string} source - Optional webhook source ('slack', 'calendly') to use source-specific URLs
 * @returns {string} The environment-specific webhook URL
 */
export function getWebhookUrl(path = '', source = null) {
  const nodeEnv = process.env.NODE_ENV || 'development';
  let webhookUrl;
  
  // If a specific source is provided, use source-specific URLs if available
  if (source && ['slack', 'calendly'].includes(source.toLowerCase())) {
    const sourceKey = source.toLowerCase();
    
    if (nodeEnv === 'production') {
      webhookUrl = env.n8n[sourceKey]?.webhookUrl || env.n8n.webhookUrl;
      logger.debug(`Using ${sourceKey} production webhook URL: ${webhookUrl}`);
    } else {
      webhookUrl = env.n8n[sourceKey]?.webhookUrlDev || env.n8n[sourceKey]?.webhookUrl || env.n8n.webhookUrlDev || env.n8n.webhookUrl;
      logger.debug(`Using ${sourceKey} development webhook URL: ${webhookUrl}`);
    }
  } else {
    // No source specified, use default URLs
    if (nodeEnv === 'production') {
      webhookUrl = env.n8n.webhookUrl; // Use production URL
      logger.debug(`Using default production webhook URL base: ${webhookUrl}`);
    } else {
      webhookUrl = env.n8n.webhookUrlDev || env.n8n.webhookUrl; // Fall back to production URL if dev not set
      logger.debug(`Using default development webhook URL base: ${webhookUrl}`);
    }
  }

  // Log detailed configuration for debugging
  logger.debug('Webhook URL Configuration', {
    nodeEnv,
    source,
    configuredUrl: webhookUrl,
    webhookUrlFromEnv: env.n8n.webhookUrl,
    webhookUrlDevFromEnv: env.n8n.webhookUrlDev,
    slackWebhookUrl: env.n8n.slack?.webhookUrl,
    calendlyWebhookUrl: env.n8n.calendly?.webhookUrl
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