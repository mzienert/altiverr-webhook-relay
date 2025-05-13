import logger from '../utils/logger.js';
import calendlyService from '../services/calendly.service.js';
import responder from '../utils/responder.js';
import axios from 'axios';
import env from '../config/env.js';

// Simple in-memory cache for recently processed event IDs
const processedEvents = new Map();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes TTL for processed events

/**
 * Generate a stable ID for deduplication from Calendly event
 * @param {Object} body - The request body
 * @returns {string|null} A stable ID for deduplication or null if cannot be generated
 */
function generateStableEventId(body) {
  // If there are URIs in the payload, use those for consistent IDs
  if (body.payload?.uri) {
    return `calendly_${body.payload.uri.split('/').pop()}`;
  }
  
  // For invitee created/canceled events
  if (body.event === 'invitee.created' || body.event === 'invitee.canceled') {
    if (body.payload?.invitee?.uri) {
      return `calendly_${body.payload.invitee.uri.split('/').pop()}`;
    }
    if (body.payload?.uri) {
      return `calendly_${body.payload.uri.split('/').pop()}`;
    }
  }
  
  // Fallback - use hash of first 100 chars of stringified body
  if (body) {
    const payload = JSON.stringify(body).slice(0, 100);
    return `calendly_${Date.now()}_${payload.replace(/[^a-zA-Z0-9]/g, '')}`;
  }
  
  return null;
}

/**
 * Check if an event has already been processed
 * @param {string} eventId - The Calendly event ID
 * @returns {boolean} True if already processed
 */
function isEventProcessed(eventId) {
  return eventId && processedEvents.has(eventId);
}

/**
 * Mark an event as processed
 * @param {string} eventId - The Calendly event ID
 */
function markEventProcessed(eventId) {
  if (!eventId) return;
  
  processedEvents.set(eventId, Date.now());
  
  // Clean up old entries
  const now = Date.now();
  for (const [id, timestamp] of processedEvents.entries()) {
    if (now - timestamp > CACHE_TTL) {
      processedEvents.delete(id);
    }
  }
}

/**
 * Handle incoming Calendly webhook
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
export async function handleCalendlyWebhook(req, res, next) {
  try {
    logger.info('Received Calendly webhook', {
      event: req.body.event || 'unknown',
      payload: req.body.payload ? 'present' : 'missing'
    });
    
    // Generate a stable event ID for deduplication
    const eventId = generateStableEventId(req.body);
    
    // Check for duplicates
    if (isEventProcessed(eventId)) {
      logger.info('Received duplicate Calendly event, ignoring', { eventId });
      return res.status(200).json({ 
        success: true, 
        message: 'Event already processed',
        duplicate: true 
      });
    }
    
    // Mark as processed BEFORE handling to prevent race conditions
    if (eventId) {
      markEventProcessed(eventId);
    }
    
    // Always forward directly to n8n in addition to standard processing
    try {
      // Use the appropriate webhook URL based on environment
      const n8nUrl = process.env.NODE_ENV === 'production'  
        ? (env.n8n?.calendly?.webhookUrl || 'https://webhook-proxy.altiverr.com/webhook/calendly')
        : (env.n8n?.calendly?.webhookUrlDev || 'https://webhook-proxy.altiverr.com/webhook-test/calendly');
      
      logger.info('Forwarding Calendly webhook to n8n', {
        url: n8nUrl,
        event: req.body.event,
        payload: req.body.payload ? 'present' : 'missing'
      });
      
      // Forward with headers
      const response = await axios.post(n8nUrl, req.body, {
        headers: {
          'Content-Type': req.headers['content-type'] || 'application/json',
          'User-Agent': req.headers['user-agent'] || 'Calendly',
          'X-Webhook-Source': 'api-service',
          'X-Webhook-Type': 'calendly',
          'X-Deduplication-ID': eventId || `calendly_${Date.now()}`
        }
      });
      
      logger.info('Successfully forwarded Calendly webhook to n8n', {
        statusCode: response.status,
        response: response.data,
        eventId
      });
    } catch (forwardError) {
      logger.error('Failed to forward Calendly webhook to n8n', {
        error: forwardError.message,
        stack: forwardError.stack,
        eventId
      });
      // Continue with normal processing even if forwarding fails
    }
    
    // Process the webhook data and publish to SNS
    const result = await calendlyService.processCalendlyWebhook(req.body);
    
    // Return success response with generated ID
    responder.success(res, 200, { id: result.id }, 'Webhook received and processed');
  } catch (error) {
    logger.error('Error processing Calendly webhook', { error: error.message });
    next(error);
  }
}

export default {
  handleCalendlyWebhook
}; 