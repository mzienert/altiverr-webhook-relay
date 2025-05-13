import express from 'express';
import snsController from '../controllers/sns.controller.js';
import logger from '../utils/logger.js';
import { getWebhookUrl } from '../utils/webhookUrl.js';
import axios from 'axios';
import env from '../../config/env.js';
import { forwardToN8n } from '../services/n8n.service.js';

const router = express.Router();

// SNS message handler - AWS expects this path
router.post('/sns', snsController.handleSnsMessage);

// Add Calendly webhooks route for internal routing 
router.post('/api/webhook/calendly', snsController.handleSnsMessage);

// Add Slack webhooks route for internal routing
router.post('/api/webhook/slack', snsController.handleSnsMessage);

// NEW DIRECT SLACK ENDPOINT - Special handling for direct Slack messages
// This endpoint will bypass SNS and go straight to n8n
router.post('/direct/slack', async (req, res) => {
  try {
    logger.info('Received webhook on direct Slack endpoint', {
      body: JSON.stringify(req.body).substring(0, 200),
      headers: req.headers,
    });
    
    // Use the Slack webhook ID from environment
    const webhookId = env.n8n.slack.webhookId || '09210404-b3f7-48c7-9cd2-07f922bc4b14';
    
    // Generate a stable webhook ID
    const messageId = `slack_manual_${req.body.event?.channel || 'channel'}_${req.body.event?.ts || Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
    
    // Construct the full URL to n8n - make sure we're using the correct format
    // Always use the webhook ID pattern for Slack
    const n8nUrl = `http://localhost:5678/webhook/${webhookId}/webhook`;
    
    logger.info(`Directly forwarding manual Slack message to n8n: ${n8nUrl}`, {
      messageId,
      eventType: req.body.event?.type || 'unknown',
      channel: req.body.event?.channel || 'unknown',
    });
    
    // Ensure the payload has the expected structure for n8n Slack trigger
    const payloadToSend = { ...req.body };
    
    // Make sure the event has a channel property which n8n Slack trigger requires
    if (payloadToSend.event && !payloadToSend.event.channel && payloadToSend.event.type === 'message') {
      // Try to get channel from different locations in the payload
      if (payloadToSend.channel_id) {
        payloadToSend.event.channel = payloadToSend.channel_id;
      } else if (payloadToSend.channel) {
        payloadToSend.event.channel = payloadToSend.channel;
      } else {
        // Provide fallback value to prevent undefined error
        payloadToSend.event.channel = 'unknown-channel';
      }
    }
    
    // Always ensure event object exists with at least a channel property
    if (!payloadToSend.event) {
      payloadToSend.event = {
        type: 'message',
        channel: 'unknown-channel'
      };
    }
    
    // Forward with Slack-specific headers that n8n expects
    const response = await axios.post(n8nUrl, payloadToSend, {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Slackbot',
        'X-Webhook-Source': 'manual-slack-message',
        'X-Webhook-Type': 'slack',
        'X-Slack-Channel': req.body.event?.channel || '',
        'X-Slack-Team': req.body.team_id || '',
        'X-Manual-Message': 'true',
        'X-N8N-Special': 'true',
      }
    });
    
    logger.info('Successfully forwarded manual Slack message to n8n', {
      statusCode: response.status,
      responseData: response.data,
      messageId
    });
    
    return res.status(200).json({
      success: true,
      message: 'Message received and forwarded to n8n',
      id: messageId,
      forwardedTo: n8nUrl
    });
  } catch (error) {
    logger.error('Failed to forward manual Slack message to n8n', {
      error: error.message,
      stack: error.stack
    });
    
    return res.status(500).json({
      success: false,
      error: error.message,
      message: 'Error forwarding message to n8n'
    });
  }
});

// Direct webhook endpoints
router.post('/webhook/slack', async (req, res) => {
  try {
    logger.info('Received webhook on direct Slack endpoint', {
      path: req.path,
      userAgent: req.headers['user-agent'],
      body: JSON.stringify(req.body).substring(0, 200)
    });
    
    // Use the correct webhook ID for Slack in n8n
    const webhookId = env.n8n.slack.webhookId || '09210404-b3f7-48c7-9cd2-07f922bc4b14';
    
    // First try the production webhook URL with the ID since workflow is active
    // Then fall back to test URLs if that fails
    const webhookUrls = [
      // Production URL first (since workflow is active)
      `http://localhost:5678/webhook/${webhookId}/webhook`,
      // Test URL as fallback
      `http://localhost:5678/webhook-test/${webhookId}/webhook`,
      // Generic URLs as last resort
      'http://localhost:5678/webhook/slack',
      'http://localhost:5678/webhook'
    ];
    
    // Log available webhook URLs for debugging
    logger.info('SLACK DEBUG - Trying the following webhook URLs', {
      webhookUrls,
      webhookId,
      configSlackUrl: JSON.stringify(env.n8n.slack || 'not set'),
      configDefaultUrl: env.n8n.webhookUrl || 'not set'
    });
    
    let succeeded = false;
    let lastError = null;
    let successfulUrl = null;
    
    // Special handling - check if this is a message from another user (not an automated message)
    const isUserMessage = req.body.event?.type === 'message' && 
                        !req.body.event?.bot_id && 
                        req.body.event?.user && 
                        req.body.event?.user !== 'U08QPJ1GLS0'; // Replace with your bot user ID
    
    if (isUserMessage) {
      logger.info('Detected manual user message, marking as MANUAL_SLACK_MESSAGE', {
        user: req.body.event?.user,
        text: req.body.event?.text?.substring(0, 50)
      });
    }
    
    // Try each webhook URL until one succeeds
    for (const webhookUrl of webhookUrls) {
      try {
        logger.info(`Trying to forward Slack webhook to n8n at: ${webhookUrl}`, {
          payload: JSON.stringify(req.body).substring(0, 200),
          isUserMessage
        });
        
        // Forward the payload to n8n with all important headers
        const forwardHeaders = {
          'Content-Type': req.headers['content-type'] || 'application/json',
          'User-Agent': req.headers['user-agent'] || 'Slackbot',
          'X-Webhook-Source': 'proxy-service',
          'X-Webhook-Type': 'slack',
          'X-Slack-Request-Timestamp': req.headers['x-slack-request-timestamp'],
          'X-Slack-Signature': req.headers['x-slack-signature'],
          'X-Slack-Channel': req.body.event?.channel || '',
          'X-Slack-Team': req.body.team_id || '',
          'X-Slack-Event-Type': req.body.event?.type || '',
          'X-Manual-Message': isUserMessage ? 'true' : 'false'
        };
        
        // Remove any undefined headers
        Object.keys(forwardHeaders).forEach(key => 
          forwardHeaders[key] === undefined && delete forwardHeaders[key]
        );
        
        // Ensure we're sending a properly formed webhook that n8n can recognize
        const payloadToSend = {
          ...req.body,
          // Add special flag for manual messages
          manual_message: isUserMessage,
          // Ensure these fields are set for Slack API compatibility
          webhook_id: webhookId,
          channel_id: req.body.event?.channel || '',
          team_id: req.body.team_id || '',
          event_type: req.body.event?.type || ''
        };
        
        const response = await axios.post(webhookUrl, payloadToSend, {
          headers: forwardHeaders
        });
        
        logger.info('Successfully forwarded Slack webhook to n8n', {
          statusCode: response.status,
          responseData: response.data,
          webhookUrl,
          isUserMessage
        });
        
        succeeded = true;
        successfulUrl = webhookUrl;
        
        return res.status(200).json({
          success: true,
          message: 'Event received and forwarded to n8n',
          id: `slack_${Date.now()}`,
          forwardedTo: webhookUrl
        });
      } catch (error) {
        lastError = error;
        logger.warn(`Failed to forward to ${webhookUrl}`, {
          error: error.message,
          status: error.response?.status,
          data: error.response?.data
        });
        // Continue to next URL
      }
    }
    
    if (!succeeded) {
      // If all URLs failed, log the error and return a friendly message
      logger.error('All webhook forwarding attempts failed', {
        error: lastError.message,
        urls: webhookUrls.join(', ')
      });
      
      return res.status(200).json({
        success: true,
        message: 'Event received but could not be forwarded to n8n (n8n webhook not configured)',
        id: `slack_${Date.now()}`
      });
    }
  } catch (error) {
    logger.error('Error handling Slack webhook', {
      error: error.message,
      stack: error.stack
    });
    
    return res.status(500).json({
      success: false,
      error: true,
      message: `Failed to process webhook: ${error.message}`
    });
  }
});

router.post('/webhook/calendly', async (req, res) => {
  try {
    logger.info('Received webhook on direct Calendly endpoint', {
      path: req.path,
      userAgent: req.headers['user-agent']
    });
    
    // Use source-specific webhook URL
    const webhookUrl = getWebhookUrl('', 'calendly');
    
    logger.info('Forwarding Calendly webhook directly to n8n', {
      destination: webhookUrl
    });
    
    // Forward the payload directly to n8n
    const response = await axios.post(webhookUrl, req.body, {
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Source': 'proxy-service',
        'X-Webhook-Type': 'calendly'
      }
    });
    
    logger.info('Successfully forwarded Calendly webhook to n8n', {
      statusCode: response.status,
      responseData: response.data
    });
    
    return res.status(200).json({
      success: true,
      message: 'Event received',
      id: `calendly_${Date.now()}`
    });
  } catch (error) {
    logger.error('Error forwarding Calendly webhook to n8n', {
      error: error.message
    });
    
    return res.status(500).json({
      success: false,
      error: true,
      message: `Failed to process webhook: ${error.message}`
    });
  }
});

// n8n-style webhook routes
// Format: /webhook-test/{uuid}/webhook (development)
router.post('/webhook-test/:uuid/webhook', async (req, res) => {
  try {
    logger.info('Received webhook from n8n development URL pattern', {
      uuid: req.params.uuid,
      path: req.path,
      userAgent: req.headers['user-agent']
    });
    
    // Check if this is a Slack webhook based on headers or body
    const isSlack = req.headers['user-agent']?.includes('Slackbot') || 
                  req.body?.type === 'event_callback' ||
                  req.body?.type === 'url_verification';
    
    // Check if this is the webhook ID we're expecting for Slack
    const webhookId = env.n8n.slack.webhookId || '09210404-b3f7-48c7-9cd2-07f922bc4b14';
    const isSlackWebhookId = req.params.uuid === webhookId;
    
    if (isSlack || isSlackWebhookId) {
      logger.info('Detected Slack webhook on n8n development URL pattern', {
        isSlackUA: req.headers['user-agent']?.includes('Slackbot'),
        isSlackEvent: req.body?.type === 'event_callback' || req.body?.type === 'url_verification',
        isSlackWebhookId,
        expectedId: webhookId,
        receivedId: req.params.uuid
      });
      
      // Try to forward to the n8n webhook for Slack
      try {
        // Get the URL to forward to - n8n test URL with the UUID
        const webhookUrl = `http://localhost:5678/webhook-test/${req.params.uuid}/webhook`;
        
        logger.info(`Forwarding Slack webhook to n8n at: ${webhookUrl}`, {
          payload: JSON.stringify(req.body).substring(0, 200)
        });
        
        // Forward the payload directly to n8n
        const response = await axios.post(webhookUrl, req.body, {
          headers: {
            'Content-Type': 'application/json',
            'X-Webhook-Source': 'proxy-service',
            'X-Webhook-Type': 'slack',
            'User-Agent': req.headers['user-agent'] || 'Slackbot'
          }
        });
        
        logger.info('Successfully forwarded Slack webhook to n8n', {
          statusCode: response.status,
          responseData: response.data,
          webhookUrl
        });
        
        return res.status(200).json({
          success: true,
          message: 'Event received and forwarded to n8n',
          id: `slack_${Date.now()}`,
          forwardedTo: webhookUrl
        });
      } catch (error) {
        logger.error('Error forwarding Slack webhook to n8n test URL', {
          error: error.message,
          status: error.response?.status,
          data: error.response?.data,
          uuid: req.params.uuid
        });
        
        return res.status(200).json({
          success: true,
          message: 'Event received but could not be forwarded to n8n',
          id: `slack_${Date.now()}`
        });
      }
    } else {
      // For non-Slack webhooks, forward to SNS handler
      logger.info('Forwarding non-Slack webhook to SNS handler');
      return snsController.handleSnsMessage(req, res);
    }
  } catch (error) {
    logger.error('Error handling webhook on n8n development URL pattern', {
      error: error.message,
      stack: error.stack,
      uuid: req.params.uuid
    });
    
    return res.status(500).json({
      success: false,
      error: true,
      message: `Failed to process webhook: ${error.message}`
    });
  }
});

// Format: /webhook/{uuid}/webhook (production)
router.post('/webhook/:uuid/webhook', async (req, res) => {
  try {
    const startTime = Date.now();
    const reqId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    
    logger.info(`[${reqId}] RECEIVED WEBHOOK - PRODUCTION PATH - START PROCESSING`, {
      uuid: req.params.uuid,
      path: req.path,
      userAgent: req.headers['user-agent'],
      method: req.method,
      contentType: req.headers['content-type'],
      bodyKeys: Object.keys(req.body || {}),
      bodyPreview: JSON.stringify(req.body).substring(0, 300),
      headers: JSON.stringify(req.headers)
    });
    
    // Check if this is a Slack webhook based on headers or body
    const isSlack = req.headers['user-agent']?.includes('Slackbot') || 
                  req.body?.type === 'event_callback' ||
                  req.body?.type === 'url_verification';
    
    // Check if this is the webhook ID we're expecting for Slack
    const webhookId = env.n8n.slack.webhookId || '09210404-b3f7-48c7-9cd2-07f922bc4b14';
    const isSlackWebhookId = req.params.uuid === webhookId;
    
    logger.info(`[${reqId}] WEBHOOK SOURCE DETECTION`, {
      uuid: req.params.uuid,
      isSlack,
      isSlackWebhookId,
      expectedSlackId: webhookId,
      hasUserAgent: !!req.headers['user-agent'],
      userAgentIsSlack: req.headers['user-agent']?.includes('Slackbot'),
      bodyType: req.body?.type,
      isEventCallback: req.body?.type === 'event_callback',
      isUrlVerification: req.body?.type === 'url_verification',
      bodyEventType: req.body?.event?.type
    });
    
    if (isSlack || isSlackWebhookId) {
      // Log detailed information about the incoming webhook
      logger.info(`[${reqId}] DETECTED SLACK WEBHOOK`, {
        uuid: req.params.uuid,
        userAgent: req.headers['user-agent'],
        contentType: req.headers['content-type'],
        payloadType: req.body?.type,
        payloadEvent: req.body?.event,
        teamId: req.body?.team_id,
        hasEvent: !!req.body?.event,
        eventType: req.body?.event?.type,
        eventTs: req.body?.event?.ts,
        eventChannel: req.body?.event?.channel,
        slackToken: req.body?.token?.substring(0, 5),
        apiAppId: req.body?.api_app_id,
        eventId: req.body?.event_id
      });
      
      logger.info(`[${reqId}] PROCESSING SLACK WEBHOOK`, {
        type: req.body?.type,
        event: req.body?.event?.type,
        slackTimestamp: req.body?.event?.ts,
        messageText: req.body?.event?.text?.substring(0, 50)
      });
      
      // Special handling - check if this is a message from a real user (not bot)
      const isUserMessage = req.body.event?.type === 'message' && 
                         !req.body.event?.bot_id && 
                         req.body.event?.user && 
                         req.body.event?.user !== 'U08QPJ1GLS0'; // Replace with your bot user ID
      
      // More detailed logging for Slack message events
      if (req.body?.event?.type === 'message') {
        logger.info(`[${reqId}] SLACK MESSAGE DETAILS`, {
          subtype: req.body?.event?.subtype || 'none',
          channel_type: req.body?.event?.channel_type,
          channel: req.body?.event?.channel,
          text: req.body?.event?.text?.substring(0, 100), // Log first 100 chars of text
          isUserMessage,
          user: req.body?.event?.user,
          hasBotId: !!req.body?.event?.bot_id,
          botId: req.body?.event?.bot_id,
          clientMsgId: req.body?.event?.client_msg_id,
          team: req.body?.event?.team,
          hasBlocks: !!req.body?.event?.blocks,
          blocksCount: req.body?.event?.blocks?.length,
          fullText: req.body?.event?.text,
          eventTs: req.body?.event?.ts
        });
      }

      // Generate stable webhook ID for deduplication
      const stableWebhookId = `slack_msg_${req.body?.team_id || ''}_${req.body?.event?.channel || ''}_${req.body?.event?.ts || Date.now()}`;

      // Add metadata to the Slack webhook payload for tracking
      const webhookData = {
        ...req.body,
        metadata: {
          id: stableWebhookId,
          receivedAt: new Date().toISOString(),
          source: 'slack',
          path: req.path,
          uuid: req.params.uuid,
          manual_message: isUserMessage,
          reqId
        }
      };
      
      logger.info(`[${reqId}] FORWARDING TO N8N - PREPARING`, {
        webhookId: stableWebhookId,
        isUserMessage,
        slackTs: req.body?.event?.ts,
        slackChannel: req.body?.event?.channel,
        slackUser: req.body?.event?.user,
        targetUuid: req.params.uuid
      });
      
      // Try to forward to the n8n webhook for Slack
      try {
        // For production, use the production URL pattern
        const webhookUrl = `http://localhost:5678/webhook/${req.params.uuid}/webhook`;
        
        logger.info(`[${reqId}] FORWARDING SLACK WEBHOOK TO N8N`, {
          targetUrl: webhookUrl,
          payload: JSON.stringify(req.body).substring(0, 300),
          headers: {
            'Content-Type': req.headers['content-type'],
            'User-Agent': req.headers['user-agent']
          },
          isUserMessage,
          webhookId: stableWebhookId
        });
        
        // Forward the payload to n8n, preserving all original headers that might be important
        const forwardHeaders = {
          'Content-Type': req.headers['content-type'] || 'application/json',
          'User-Agent': req.headers['user-agent'] || 'Slackbot',
          'X-Webhook-Source': 'proxy-service',
          'X-Webhook-Type': 'slack',
          'X-Slack-Request-Timestamp': req.headers['x-slack-request-timestamp'],
          'X-Slack-Signature': req.headers['x-slack-signature'],
          'X-Slack-Channel': req.body?.event?.channel || '',
          'X-Slack-Team': req.body?.team_id || '',
          'X-Slack-Event-Type': req.body?.event?.type || '',
          'X-Manual-Message': isUserMessage ? 'true' : 'false',
          'X-Deduplication-ID': stableWebhookId,
          'X-Request-ID': reqId
        };
        
        logger.info(`[${reqId}] FORWARDING SLACK WEBHOOK - HEADERS`, {
          headers: JSON.stringify(forwardHeaders)
        });
        
        // Ensure we're sending a properly formed webhook that n8n can recognize
        const payloadToSend = {
          ...req.body,
          // Add special flags to help n8n detect this correctly
          manual_message: isUserMessage,
          // Ensure these fields are set for Slack API compatibility
          webhook_id: req.params.uuid,
          channel_id: req.body?.event?.channel || '',
          team_id: req.body?.team_id || '',
          event_type: req.body?.event?.type || '',
          // Add tracking IDs
          _webhookId: stableWebhookId,
          _requestId: reqId,
          _receivedAt: new Date().toISOString(),
          _isUserMessage: isUserMessage
        };
        
        // Fix for n8n Slack trigger node - ensure event has channel property
        if (payloadToSend.event && !payloadToSend.event.channel && payloadToSend.event.type === 'message') {
          // Try to get channel from different sources
          if (payloadToSend.channel_id) {
            payloadToSend.event.channel = payloadToSend.channel_id;
          } else if (payloadToSend.channel) {
            payloadToSend.event.channel = payloadToSend.channel;
          } else {
            // Fallback value to prevent undefined error
            payloadToSend.event.channel = 'unknown-channel';
          }
          
          logger.info(`[${reqId}] ADDED MISSING CHANNEL TO EVENT`, {
            channel: payloadToSend.event.channel,
            source: payloadToSend.channel_id ? 'channel_id' : (payloadToSend.channel ? 'channel' : 'fallback')
          });
        }
        
        logger.info(`[${reqId}] FORWARDING SLACK WEBHOOK - SENDING REQUEST`, {
          url: webhookUrl, 
          headers: JSON.stringify(forwardHeaders),
          payloadSize: JSON.stringify(payloadToSend).length,
          payloadPreview: JSON.stringify(payloadToSend).substring(0, 300)
        });
        
        const response = await axios.post(webhookUrl, payloadToSend, {
          headers: forwardHeaders
        });
        
        const processingTime = Date.now() - startTime;
        
        logger.info(`[${reqId}] SUCCESSFULLY FORWARDED TO N8N`, {
          statusCode: response.status,
          responseData: JSON.stringify(response.data),
          webhookUrl,
          isUserMessage,
          webhookId: stableWebhookId,
          processingTime: `${processingTime}ms`
        });
        
        return res.status(200).json({
          success: true,
          message: 'Event received and forwarded to n8n production webhook',
          id: stableWebhookId,
          forwardedTo: webhookUrl,
          processingTime
        });
      } catch (error) {
        // If direct forwarding failed, try alternative URLs as fallback
        logger.error(`[${reqId}] ERROR FORWARDING TO N8N`, {
          error: error.message,
          status: error.response?.status,
          data: error.response?.data ? JSON.stringify(error.response?.data) : null,
          uuid: req.params.uuid,
          stack: error.stack
        });
        
        // Try alternative n8n webhook URLs as fallbacks
        const fallbackUrls = [
          `http://localhost:5678/webhook/${webhookId}/webhook`,  // Try with correct ID
          'http://localhost:5678/webhook/slack',                 // Try direct webhook
          'http://localhost:5678/webhook'                        // Try generic webhook
        ];
        
        logger.info(`[${reqId}] ATTEMPTING FALLBACK WEBHOOK URLS`, {
          fallbackUrls
        });
        
        let fallbackSucceeded = false;
        let lastFallbackError = null;
        let successfulUrl = null;
        
        for (const fallbackUrl of fallbackUrls) {
          try {
            logger.info(`[${reqId}] TRYING FALLBACK URL: ${fallbackUrl}`);
            
            const fallbackResponse = await axios.post(fallbackUrl, payloadToSend, {
              headers: forwardHeaders
            });
            
            logger.info(`[${reqId}] FALLBACK SUCCEEDED: ${fallbackUrl}`, {
              statusCode: fallbackResponse.status,
              responseData: JSON.stringify(fallbackResponse.data)
            });
            
            fallbackSucceeded = true;
            successfulUrl = fallbackUrl;
            break;
          } catch (fallbackError) {
            lastFallbackError = fallbackError;
            logger.warn(`[${reqId}] FALLBACK FAILED: ${fallbackUrl}`, {
              error: fallbackError.message,
              response: fallbackError.response?.data ? JSON.stringify(fallbackError.response?.data) : null
            });
          }
        }
        
        if (fallbackSucceeded) {
          const processingTime = Date.now() - startTime;
          
          return res.status(200).json({
            success: true,
            message: 'Event received and forwarded to n8n fallback webhook',
            id: stableWebhookId,
            forwardedTo: successfulUrl,
            processingTime
          });
        }
        
        // If all fallbacks failed, return a friendly message
        logger.error(`[${reqId}] ALL FALLBACKS FAILED`, {
          error: lastFallbackError?.message,
          originalError: error.message
        });
        
        return res.status(200).json({
          success: true,
          message: 'Event received but could not be forwarded to n8n',
          id: stableWebhookId,
          error: error.message
        });
      }
    } else {
      // For non-Slack webhooks, forward to SNS handler
      logger.info(`[${reqId}] FORWARDING NON-SLACK WEBHOOK TO SNS HANDLER`, {
        uuid: req.params.uuid,
        contentType: req.headers['content-type'],
        userAgent: req.headers['user-agent']
      });
      
      return snsController.handleSnsMessage(req, res);
    }
  } catch (error) {
    const errorId = `err_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    
    logger.error(`[${errorId}] UNHANDLED ERROR IN PRODUCTION PATH HANDLER`, {
      error: error.message,
      stack: error.stack,
      uuid: req.params.uuid,
      path: req.path,
      method: req.method,
      headers: JSON.stringify(req.headers),
      bodyPreview: req.body ? JSON.stringify(req.body).substring(0, 300) : null
    });
    
    return res.status(500).json({
      success: false,
      error: true,
      message: `Failed to process webhook: ${error.message}`,
      errorId
    });
  }
});

// Add GET method support for URL verification
router.get('/webhook-test/:uuid/webhook', (req, res) => {
  logger.info('Received verification GET request on n8n dev path', {
    uuid: req.params.uuid
  });
  return res.status(200).json({
    success: true,
    message: 'Webhook endpoint is active'
  });
});

router.get('/webhook/:uuid/webhook', (req, res) => {
  logger.info('Received verification GET request on n8n prod path', {
    uuid: req.params.uuid
  });
  return res.status(200).json({
    success: true,
    message: 'Webhook endpoint is active'
  });
});

// Handle route without webhook/ prefix (actual path observed in logs)
router.post('/:uuid/webhook', async (req, res) => {
  try {
    const startTime = Date.now();
    const reqId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    
    logger.info(`[${reqId}] RECEIVED WEBHOOK - DIRECT PATH - START PROCESSING`, {
      uuid: req.params.uuid,
      path: req.path,
      userAgent: req.headers['user-agent'],
      method: req.method,
      contentType: req.headers['content-type'],
      bodyKeys: Object.keys(req.body || {}),
      bodyPreview: JSON.stringify(req.body).substring(0, 300),
      headers: JSON.stringify(req.headers)
    });
    
    // Check if this is a Slack webhook based on headers or body
    const isSlack = req.headers['user-agent']?.includes('Slackbot') || 
                  req.body?.type === 'event_callback' ||
                  req.body?.type === 'url_verification';
    
    // Check if this is the webhook ID we're expecting for Slack
    const webhookId = env.n8n.slack.webhookId || '09210404-b3f7-48c7-9cd2-07f922bc4b14';
    const isSlackWebhookId = req.params.uuid === webhookId;
    
    logger.info(`[${reqId}] WEBHOOK SOURCE DETECTION`, {
      uuid: req.params.uuid,
      isSlack,
      isSlackWebhookId,
      expectedSlackId: webhookId,
      hasUserAgent: !!req.headers['user-agent'],
      userAgentIsSlack: req.headers['user-agent']?.includes('Slackbot'),
      bodyType: req.body?.type,
      isEventCallback: req.body?.type === 'event_callback',
      isUrlVerification: req.body?.type === 'url_verification',
      bodyEventType: req.body?.event?.type
    });
    
    if (isSlack || isSlackWebhookId) {
      logger.info(`[${reqId}] DETECTED SLACK WEBHOOK`, {
        uuid: req.params.uuid,
        userAgent: req.headers['user-agent'],
        contentType: req.headers['content-type'],
        payloadType: req.body?.type,
        payloadEvent: req.body?.event,
        teamId: req.body?.team_id,
        hasEvent: !!req.body?.event,
        eventType: req.body?.event?.type,
        eventTs: req.body?.event?.ts,
        eventChannel: req.body?.event?.channel,
        slackToken: req.body?.token?.substring(0, 5),
        apiAppId: req.body?.api_app_id,
        eventId: req.body?.event_id
      });
      
      logger.info(`[${reqId}] PROCESSING SLACK WEBHOOK`, {
        type: req.body?.type,
        event: req.body?.event?.type,
        slackTimestamp: req.body?.event?.ts,
        messageText: req.body?.event?.text?.substring(0, 50)
      });
      
      // Special handling - check if this is a message from a real user (not bot)
      const isUserMessage = req.body.event?.type === 'message' && 
                         !req.body.event?.bot_id && 
                         req.body.event?.user && 
                         req.body.event?.user !== 'U08QPJ1GLS0'; // Replace with your bot user ID
      
      // More detailed logging for Slack message events
      if (req.body?.event?.type === 'message') {
        logger.info(`[${reqId}] SLACK MESSAGE DETAILS`, {
          subtype: req.body?.event?.subtype || 'none',
          channel_type: req.body?.event?.channel_type,
          channel: req.body?.event?.channel,
          text: req.body?.event?.text?.substring(0, 100), // Log first 100 chars of text
          isUserMessage,
          user: req.body?.event?.user,
          hasBotId: !!req.body?.event?.bot_id,
          botId: req.body?.event?.bot_id,
          clientMsgId: req.body?.event?.client_msg_id,
          team: req.body?.event?.team,
          hasBlocks: !!req.body?.event?.blocks,
          blocksCount: req.body?.event?.blocks?.length,
          fullText: req.body?.event?.text,
          eventTs: req.body?.event?.ts
        });
      }
      
      // Generate webhook ID for deduplication
      const webhookId = `slack_msg_${req.body?.team_id || ''}_${req.body?.event?.channel || ''}_${req.body?.event?.ts || Date.now()}`;
      
      // Add metadata to the Slack webhook payload for tracking
      const webhookData = {
        ...req.body,
        metadata: {
          id: webhookId,
          receivedAt: new Date().toISOString(),
          source: 'slack',
          path: req.path,
          uuid: req.params.uuid,
          manual_message: isUserMessage,
          reqId
        }
      };
      
      logger.info(`[${reqId}] FORWARDING TO N8N - PREPARING`, {
        webhookId,
        isUserMessage,
        slackTs: req.body?.event?.ts,
        slackChannel: req.body?.event?.channel,
        slackUser: req.body?.event?.user,
        targetUuid: req.params.uuid
      });
      
      // Forward to correct n8n URL format
      try {
        // For production, use the production URL pattern - with the webhook/ prefix
        const webhookUrl = `http://localhost:5678/webhook/${req.params.uuid}/webhook`;
        
        logger.info(`[${reqId}] FORWARDING SLACK WEBHOOK TO N8N`, {
          targetUrl: webhookUrl,
          payload: JSON.stringify(req.body).substring(0, 300),
          headers: {
            'Content-Type': req.headers['content-type'],
            'User-Agent': req.headers['user-agent']
          },
          isUserMessage,
          webhookId
        });
        
        // Forward the payload to n8n, preserving all original headers that might be important
        const forwardHeaders = {
          'Content-Type': req.headers['content-type'] || 'application/json',
          'User-Agent': req.headers['user-agent'] || 'Slackbot',
          'X-Webhook-Source': 'proxy-service',
          'X-Webhook-Type': 'slack',
          'X-Slack-Request-Timestamp': req.headers['x-slack-request-timestamp'],
          'X-Slack-Signature': req.headers['x-slack-signature'],
          'X-Slack-Channel': req.body?.event?.channel || '',
          'X-Slack-Team': req.body?.team_id || '',
          'X-Slack-Event-Type': req.body?.event?.type || '',
          'X-Manual-Message': isUserMessage ? 'true' : 'false',
          'X-Deduplication-ID': webhookId,
          'X-Request-ID': reqId
        };
        
        // Ensure we're sending a properly formed webhook that n8n can recognize
        const payloadToSend = {
          ...req.body,
          // Add special flags to help n8n detect this correctly
          manual_message: isUserMessage,
          // Ensure these fields are set for Slack API compatibility
          webhook_id: req.params.uuid,
          channel_id: req.body?.event?.channel || '',
          team_id: req.body?.team_id || '',
          event_type: req.body?.event?.type || '',
          // Add tracking IDs
          _webhookId: webhookId,
          _requestId: reqId,
          _receivedAt: new Date().toISOString(),
          _isUserMessage: isUserMessage
        };
        
        // Fix for n8n Slack trigger node - ensure event has channel property
        if (payloadToSend.event && !payloadToSend.event.channel && payloadToSend.event.type === 'message') {
          // Try to get channel from different sources
          if (payloadToSend.channel_id) {
            payloadToSend.event.channel = payloadToSend.channel_id;
          } else if (payloadToSend.channel) {
            payloadToSend.event.channel = payloadToSend.channel;
          } else {
            // Fallback value to prevent undefined error
            payloadToSend.event.channel = 'unknown-channel';
          }
          
          logger.info(`[${reqId}] ADDED MISSING CHANNEL TO EVENT`, {
            channel: payloadToSend.event.channel,
            source: payloadToSend.channel_id ? 'channel_id' : (payloadToSend.channel ? 'channel' : 'fallback')
          });
        }
        
        logger.info(`[${reqId}] FORWARDING SLACK WEBHOOK - SENDING REQUEST`, {
          url: webhookUrl,
          headers: JSON.stringify(forwardHeaders),
          payloadSize: JSON.stringify(payloadToSend).length,
          payloadPreview: JSON.stringify(payloadToSend).substring(0, 300)
        });
        
        const response = await axios.post(webhookUrl, payloadToSend, {
          headers: forwardHeaders
        });
        
        const processingTime = Date.now() - startTime;
        
        logger.info(`[${reqId}] SUCCESSFULLY FORWARDED TO N8N`, {
          statusCode: response.status,
          responseData: JSON.stringify(response.data),
          webhookUrl,
          isUserMessage,
          webhookId,
          processingTime: `${processingTime}ms`
        });
        
        return res.status(200).json({
          success: true,
          message: 'Event received and forwarded to n8n production webhook',
          id: webhookId,
          forwardedTo: webhookUrl,
          processingTime
        });
      } catch (error) {
        // If direct forwarding failed, try alternative URLs as fallback
        logger.error(`[${reqId}] ERROR FORWARDING TO N8N`, {
          error: error.message,
          status: error.response?.status,
          data: error.response?.data ? JSON.stringify(error.response?.data) : null,
          uuid: req.params.uuid,
          stack: error.stack
        });
        
        return res.status(200).json({
          success: true,
          message: 'Event received but could not be forwarded to n8n',
          id: webhookId,
          error: error.message
        });
      }
    } else {
      // For non-Slack webhooks, forward to SNS handler
      logger.info(`[${reqId}] FORWARDING NON-SLACK WEBHOOK TO SNS HANDLER`, {
        uuid: req.params.uuid,
        contentType: req.headers['content-type'],
        userAgent: req.headers['user-agent']
      });
      
      return snsController.handleSnsMessage(req, res);
    }
  } catch (error) {
    const errorId = `err_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    
    logger.error(`[${errorId}] UNHANDLED ERROR IN DIRECT PATH HANDLER`, {
      error: error.message,
      stack: error.stack,
      uuid: req.params.uuid,
      path: req.path,
      method: req.method,
      headers: JSON.stringify(req.headers),
      bodyPreview: req.body ? JSON.stringify(req.body).substring(0, 300) : null
    });
    
    return res.status(500).json({
      success: false,
      error: true,
      message: `Failed to process webhook: ${error.message}`,
      errorId
    });
  }
});

// Direct webhook verification endpoints
router.get('/webhook/slack', (req, res) => {
  logger.info('Received verification GET request on direct Slack endpoint');
  return res.status(200).json({
    success: true,
    message: 'Slack webhook endpoint is active'
  });
});

router.get('/webhook/calendly', (req, res) => {
  logger.info('Received verification GET request on direct Calendly endpoint');
  return res.status(200).json({
    success: true,
    message: 'Calendly webhook endpoint is active'
  });
});

export default router; 