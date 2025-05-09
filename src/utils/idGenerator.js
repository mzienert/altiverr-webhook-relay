import { v4 as uuidv4 } from 'uuid';

/**
 * Generate a unique ID for webhook messages
 * @param {string} prefix - Optional prefix for the ID
 * @returns {string} A unique identifier
 */
export function generateId(prefix = 'whk') {
  return `${prefix}_${uuidv4()}`;
}

/**
 * Generate a timestamp in ISO format
 * @returns {string} Current timestamp in ISO format
 */
export function generateTimestamp() {
  return new Date().toISOString();
}

/**
 * Generate webhook metadata for tracking and idempotency
 * @param {string} source - Source of the webhook (e.g., 'calendly')
 * @returns {Object} Metadata object with id and timestamps
 */
export function generateWebhookMetadata(source) {
  return {
    id: generateId(`${source}`),
    receivedAt: generateTimestamp(),
    source
  };
}

export default {
  generateId,
  generateTimestamp,
  generateWebhookMetadata
}; 