import express from 'express';
import logger from '../utils/logger.js';
import { getWebhookUrl } from '../utils/webhookUrl.js';
import axios from 'axios';
import env from '../../config/env.js';

const router = express.Router();

// Debug route for testing webhook forwarding without SNS validation
router.post('/debug/webhook', async (req, res) => {
  try {
    // Determine webhook URL based on environment
    const webhookUrl = env.n8n.webhookUrl || 'http://localhost:5678/webhook';
    logger.debug(`Using webhook URL: ${webhookUrl}`);
    
    const payload = req.body;
    
    logger.debug('Received debug webhook request', { payload });
    
    // Log the request information
    logger.info('Debug webhook received', {
      timestamp: new Date().toISOString(),
      eventType: payload.eventType || 'DEBUG_EVENT',
      id: payload.data?.id || 'debug-webhook',
      source: payload.data?.source || 'debug-endpoint'
    });
    
    // Forward the payload directly to n8n
    try {
      const response = await axios.post(webhookUrl, payload);
      
      logger.debug('Debug webhook forwarded successfully', {
        statusCode: response.status,
        responseData: response.data
      });
      
      return res.status(200).json({
        success: true,
        message: 'Debug webhook received and forwarded',
        forwardedTo: webhookUrl,
        forwardResponse: {
          status: response.status,
          data: response.data
        }
      });
    } catch (forwardError) {
      logger.error('Error forwarding to n8n', { 
        error: forwardError.message,
        stack: forwardError.stack,
        webhookUrl
      });
      
      return res.status(502).json({
        success: false,
        error: 'Failed to forward webhook to n8n',
        message: forwardError.message,
        webhookUrl
      });
    }
  } catch (error) {
    logger.error('Error processing debug webhook', { 
      error: error.message || 'Unknown error',
      stack: error.stack
    });
    
    return res.status(500).json({
      success: false,
      error: 'Failed to process debug webhook',
      message: error.message || 'Unknown error'
    });
  }
});

export default router; 