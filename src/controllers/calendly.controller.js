import logger from '../utils/logger.js';
import calendlyService from '../services/calendly.service.js';
import responder from '../utils/responder.js';

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