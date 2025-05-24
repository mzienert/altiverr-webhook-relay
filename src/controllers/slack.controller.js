import logger from '../utils/logger.js';
import slackService from '../services/slack.service.js';
import responder from '../utils/responder.js';

// Simple in-memory cache for recently processed event IDs
// In production, consider using Redis or similar for distributed caching
const processedEvents = new Map();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes TTL for processed events (increased from 1 minute)

/**
 * Generate a stable ID for deduplication from Slack event
 * @param {Object} body - The request body
 * @returns {string|null} A stable ID for deduplication or null if cannot be generated
 */
function generateStableEventId(body) {
  // If there's an explicit event_id, use it
  if (body.event_id) {
    return `slack_${body.event_id}`;
  }
  
  // For message events, use team + channel + timestamp for a stable ID
  if (body.event?.type === 'message' && body.event?.ts) {
    return `slack_msg_${body.team_id || ''}_${body.event.channel || ''}_${body.event.ts}`;
  }
  
  // For URL verification
  if (body.type === 'url_verification' && body.challenge) {
    return `slack_challenge_${body.challenge}`;
  }
  
  // Fallback - use hash of first 100 chars of stringified body
  if (body) {
    const payload = JSON.stringify(body).slice(0, 100);
    return `slack_${Date.now()}_${payload.replace(/[^a-zA-Z0-9]/g, '')}`;
  }
  
  return null;
}

/**
 * Check if an event has already been processed
 * @param {string} eventId - The Slack event ID
 * @returns {boolean} True if already processed
 */
function isEventProcessed(eventId) {
  return eventId && processedEvents.has(eventId);
}

/**
 * Mark an event as processed
 * @param {string} eventId - The Slack event ID
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
 * Handle incoming Slack webhook
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
export async function handleSlackWebhook(req, res, next) {
  try {
    // Handle GET requests (used by Slack for URL verification)
    if (req.method === 'GET') {
      logger.info('Received Slack URL verification via GET');
      return responder.success(res, 200, {}, 'Slack webhook endpoint is active');
    }
    
    logger.info('Received Slack webhook', {
      type: req.body.type || 'unknown',
      event: req.body.event?.type || 'unknown'
    });
    
    // Special handling for Slack URL verification
    if (req.body.type === 'url_verification') {
      logger.info('Received Slack URL verification challenge');
      return responder.success(res, 200, { challenge: req.body.challenge });
    }
    
    // Generate a stable event ID for deduplication
    const eventId = generateStableEventId(req.body);
    
    // Check for duplicates
    if (isEventProcessed(eventId)) {
      logger.info('Received duplicate Slack event, ignoring', { eventId });
      return responder.success(res, 200, { duplicate: true }, 'Event already processed');
    }
    
    // Mark as processed BEFORE handling to prevent race conditions
    if (eventId) {
      markEventProcessed(eventId);
    }
    
    // For non-event_callback requests, process immediately
    if (req.body.type !== 'event_callback') {
      const result = await slackService.processSlackWebhook(req.body);
      return responder.success(res, 200, { id: result.id }, 'Webhook received and processed');
    }
    
    // For event_callback, process synchronously to ensure SNS completes
    logger.info('Processing Slack event synchronously to ensure SNS delivery');
    try {
      const result = await slackService.processSlackWebhook(req.body);
      logger.info('Synchronous processing completed successfully', { 
        eventId, 
        messageId: result.id,
        snsMessageId: result.snsMessageId
      });
      
      return responder.success(res, 200, { 
        id: result.id,
        snsMessageId: result.snsMessageId
      }, 'Event received and processed');
    } catch (error) {
      logger.error('Error in synchronous webhook processing', { 
        error: error.message, 
        eventId 
      });
      
      return responder.error(res, 500, 'Failed to process webhook', { 
        originalError: error.message,
        id: eventId
      });
    }
  } catch (error) {
    logger.error('Error processing Slack webhook', { error: error.message });
    next(error);
  }
}

export default {
  handleSlackWebhook
}; 