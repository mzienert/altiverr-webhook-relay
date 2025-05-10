import crypto from 'crypto';
import env from '../config/env.js';
import logger from '../utils/logger.js';
import { generateWebhookMetadata } from '../utils/idGenerator.js';
import { publishToSns } from './sns.service.js';

/**
 * Verify Calendly webhook signature if secret is configured
 * @param {Object} req - Express request object
 * @returns {boolean} True if signature is valid or not required
 */
export function verifyCalendlySignature(req) {
  // Skip verification if no secret is configured
  if (!env.calendly.webhookSecret) {
    logger.warn('Calendly webhook signature verification skipped - no secret configured');
    return true;
  }
  
  try {
    const signature = req.headers['calendly-webhook-signature'];
    
    if (!signature) {
      logger.warn('Calendly webhook signature missing');
      return false;
    }
    
    // Get the raw body as a string
    const rawBody = JSON.stringify(req.body);
    
    // Create HMAC with Calendly secret
    const hmac = crypto.createHmac('sha256', env.calendly.webhookSecret);
    hmac.update(rawBody);
    const calculatedSignature = hmac.digest('hex');
    
    // Compare signatures
    return crypto.timingSafeEqual(
      Buffer.from(calculatedSignature),
      Buffer.from(signature)
    );
  } catch (error) {
    logger.error('Calendly signature verification failed', { error: error.message });
    return false;
  }
}

/**
 * Normalize Calendly webhook data into a standard format
 * @param {Object} data - The raw Calendly webhook data
 * @returns {Object} Normalized webhook data
 */
export function normalizeCalendlyData(data) {
  // Add source identifier
  const source = 'calendly';
  
  // Generate metadata for tracking
  const metadata = generateWebhookMetadata(source);
  
  // Create normalized format
  return {
    metadata,
    event: {
      name: data.event || data.payload?.event_type?.name,
      type: data.event_type || 'calendly.event',
      time: data.created_at || new Date().toISOString()
    },
    payload: {
      original: data,
      // Extract key information for easier access
      event: data.payload?.event || null,
      invitee: data.payload?.invitee || null,
      tracking: data.payload?.tracking || null
    }
  };
}

/**
 * Process a Calendly webhook and publish to SNS
 * @param {Object} data - The Calendly webhook data
 * @returns {Promise<Object>} Processing result
 */
export async function processCalendlyWebhook(data) {
  try {
    // Normalize the Calendly data
    const normalizedData = normalizeCalendlyData(data);
    
    // Publish to SNS using the generated ID for idempotency
    const result = await publishToSns(
      normalizedData, 
      normalizedData.metadata.id
    );
    
    return {
      success: true,
      message: 'Calendly webhook processed successfully',
      id: normalizedData.metadata.id,
      snsMessageId: result.messageId
    };
  } catch (error) {
    logger.error('Failed to process Calendly webhook', { error: error.message });
    throw error;
  }
}

export default {
  verifyCalendlySignature,
  normalizeCalendlyData,
  processCalendlyWebhook
}; 