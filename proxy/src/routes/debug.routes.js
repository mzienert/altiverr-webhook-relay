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

// New endpoint to specifically test SNS format Slack messages
router.post('/debug/sns-slack', async (req, res) => {
  try {
    const trackingId = `debug_sns_${Date.now()}`;
    logger.info(`[${trackingId}] SNS-SLACK DEBUG - REQUEST RECEIVED`, {
      headers: req.headers,
      bodyKeys: Object.keys(req.body),
      bodyPreview: JSON.stringify(req.body).substring(0, 300)
    });
    
    // Check if we have a Message field (SNS format)
    if (!req.body.Message || typeof req.body.Message !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Not an SNS message format',
        message: 'Message field missing or not a string'
      });
    }
    
    try {
      // Parse the SNS Message field
      const parsedMessage = JSON.parse(req.body.Message);
      logger.info(`[${trackingId}] SNS-SLACK DEBUG - PARSED MESSAGE`, {
        parsedKeys: Object.keys(parsedMessage),
        hasData: !!parsedMessage.data,
        hasMetadata: !!parsedMessage.data?.metadata,
        hasPayload: !!parsedMessage.data?.payload
      });
      
      // Check if we have the expected structure
      if (!parsedMessage.data?.payload?.original) {
        return res.status(400).json({
          success: false,
          error: 'Invalid SNS message format',
          message: 'Missing data.payload.original structure'
        });
      }
      
      // Extract the Slack payload
      const slackPayload = parsedMessage.data.payload.original;
      
      // Add channel from SNS wrapper if needed
      if (parsedMessage.data.channel && slackPayload.event && !slackPayload.event.channel) {
        slackPayload.event.channel = parsedMessage.data.channel;
        logger.info(`[${trackingId}] SNS-SLACK DEBUG - ADDED CHANNEL TO EVENT`, {
          channel: parsedMessage.data.channel
        });
      }
      
      // Add team_id if needed
      if (parsedMessage.data.team_id && !slackPayload.team_id) {
        slackPayload.team_id = parsedMessage.data.team_id;
        logger.info(`[${trackingId}] SNS-SLACK DEBUG - ADDED TEAM_ID`, {
          team_id: parsedMessage.data.team_id
        });
      }
      
      // Ensure event has a channel for Slack trigger
      if (slackPayload.event && !slackPayload.event.channel) {
        slackPayload.event.channel = 'debug-channel';
        logger.info(`[${trackingId}] SNS-SLACK DEBUG - ADDED FALLBACK CHANNEL`, {
          channel: 'debug-channel' 
        });
      }
      
      // Add debug headers
      const headers = {
        'Content-Type': 'application/json',
        'User-Agent': 'Altiverr-Debug-Proxy/1.0',
        'X-Webhook-Source': 'debug-proxy',
        'X-Webhook-Type': 'slack',
        'X-Debug-ID': trackingId
      };
      
      // Add Slack-specific headers
      if (slackPayload.event?.channel) {
        headers['X-Slack-Channel'] = slackPayload.event.channel;
      }
      if (slackPayload.team_id) {
        headers['X-Slack-Team'] = slackPayload.team_id;
      }
      if (slackPayload.event?.type) {
        headers['X-Slack-Event-Type'] = slackPayload.event.type;
      }
      
      // Log the extracted payload
      logger.info(`[${trackingId}] SNS-SLACK DEBUG - EXTRACTED PAYLOAD`, {
        payloadKeys: Object.keys(slackPayload),
        hasEvent: !!slackPayload.event,
        eventType: slackPayload.event?.type,
        channel: slackPayload.event?.channel,
        payloadPreview: JSON.stringify(slackPayload).substring(0, 300)
      });
      
      // Get the webhook URL
      const slackWebhookId = env.n8n.slack.webhookId || '09210404-b3f7-48c7-9cd2-07f922bc4b14';
      const baseUrl = env.n8n.webhookUrl.replace(/\/calendly$/, '');
      const webhookUrl = `${baseUrl}/${slackWebhookId}/webhook`;
      
      logger.info(`[${trackingId}] SNS-SLACK DEBUG - FORWARDING TO N8N`, {
        webhookUrl,
        headers: JSON.stringify(headers)
      });
      
      // Send to n8n
      try {
        const response = await axios.post(webhookUrl, slackPayload, {
          headers,
          timeout: 5000
        });
        
        logger.info(`[${trackingId}] SNS-SLACK DEBUG - FORWARDING SUCCESS`, {
          statusCode: response.status,
          responseData: response.data
        });
        
        return res.status(200).json({
          success: true,
          message: 'SNS Slack message extracted and forwarded',
          extractedPayload: slackPayload,
          forwardResponse: {
            status: response.status,
            data: response.data
          }
        });
      } catch (forwardError) {
        logger.error(`[${trackingId}] SNS-SLACK DEBUG - FORWARDING ERROR`, {
          error: forwardError.message,
          status: forwardError.response?.status,
          data: forwardError.response?.data
        });
        
        return res.status(502).json({
          success: false,
          error: 'Failed to forward to n8n',
          message: forwardError.message,
          extractedPayload: slackPayload,
          n8nResponse: forwardError.response?.data
        });
      }
    } catch (parseError) {
      logger.error(`[${trackingId}] SNS-SLACK DEBUG - JSON PARSE ERROR`, {
        error: parseError.message,
        messagePreview: req.body.Message.substring(0, 100)
      });
      
      return res.status(400).json({
        success: false,
        error: 'Failed to parse SNS Message',
        message: parseError.message
      });
    }
  } catch (error) {
    logger.error('SNS-SLACK DEBUG - GENERAL ERROR', {
      error: error.message,
      stack: error.stack
    });
    
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
});

export default router; 