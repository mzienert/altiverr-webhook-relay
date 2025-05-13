import logger from '../utils/logger.js';
import slackService from '../services/slack.service.js';
import responder from '../utils/responder.js';

// Simple in-memory cache for recently processed event IDs
// In production, consider using Redis or similar for distributed caching
const processedEvents = new Map();
const CACHE_TTL = 60 * 1000; // 1 minute TTL for processed events

/**
 * Check if an event has already been processed
 * @param {string} eventId - The Slack event ID
 * @returns {boolean} True if already processed
 */
function isEventProcessed(eventId) {
  return processedEvents.has(eventId);
}

/**
 * Mark an event as processed
 * @param {string} eventId - The Slack event ID
 */
function markEventProcessed(eventId) {
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
      return res.status(200).json({
        success: true,
        message: 'Slack webhook endpoint is active'
      });
    }
    
    logger.info('Received Slack webhook', {
      type: req.body.type || 'unknown',
      event: req.body.event?.type || 'unknown'
    });
    
    // Special handling for Slack URL verification
    if (req.body.type === 'url_verification') {
      logger.info('Received Slack URL verification challenge');
      return res.status(200).json({ challenge: req.body.challenge });
    }
    
    // Check for duplicates using event_id
    const eventId = req.body.event_id;
    if (eventId && isEventProcessed(eventId)) {
      logger.info('Received duplicate Slack event, ignoring', { eventId });
      return res.status(200).json({ 
        success: true, 
        message: 'Event already processed',
        duplicate: true 
      });
    }
    
    // Immediately acknowledge receipt to prevent retries
    // Process the webhook asynchronously after response
    if (eventId) {
      markEventProcessed(eventId);
    }
    
    // For non-event_callback requests, process immediately
    if (req.body.type !== 'event_callback') {
      const result = await slackService.processSlackWebhook(req.body);
      return responder.success(res, 200, { id: result.id }, 'Webhook received and processed');
    }
    
    // For event_callback, acknowledge immediately and process async
    const responseId = `slack_${Date.now()}`;
    res.status(200).json({ 
      success: true, 
      message: 'Event received',
      id: responseId
    });
    
    // Process after response is sent
    slackService.processSlackWebhook(req.body)
      .then(result => {
        logger.info('Async processing completed successfully', { 
          eventId, 
          responseId, 
          messageId: result.id 
        });
      })
      .catch(error => {
        logger.error('Error in async webhook processing', { 
          error: error.message, 
          eventId 
        });
      });
  } catch (error) {
    logger.error('Error processing Slack webhook', { error: error.message });
    next(error);
  }
}

export default {
  handleSlackWebhook
}; 