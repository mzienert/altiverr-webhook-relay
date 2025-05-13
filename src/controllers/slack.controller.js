import logger from '../utils/logger.js';
import slackService from '../services/slack.service.js';
import responder from '../utils/responder.js';

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
    
    // Process the webhook data and publish to SNS
    const result = await slackService.processSlackWebhook(req.body);
    
    // Special handling for Slack URL verification
    if (result.isChallenge) {
      return res.status(200).json({ challenge: result.challenge });
    }
    
    // Return success response with generated ID
    responder.success(res, 200, { id: result.id }, 'Webhook received and processed');
  } catch (error) {
    logger.error('Error processing Slack webhook', { error: error.message });
    next(error);
  }
}

export default {
  handleSlackWebhook
}; 