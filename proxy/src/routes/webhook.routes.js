import express from 'express';
import snsController from '../controllers/sns.controller.js';
import logger from '../utils/logger.js';
import { getWebhookUrl } from '../utils/webhookUrl.js';
import axios from 'axios';
import env from '../../config/env.js';
import { forwardToN8n } from '../services/n8n.service.js';

const router = express.Router();

// Shared cache for webhook deduplication across all endpoints
const processedWebhooks = new Map();
const WEBHOOK_EXPIRY_TIME = 30 * 60 * 1000; // 30 minutes

// Cleanup function to prevent memory leaks
function cleanupProcessedWebhooks() {
  const now = Date.now();
  let cleanupCount = 0;
  
  processedWebhooks.forEach((timestamp, id) => {
    if (now - timestamp > WEBHOOK_EXPIRY_TIME) {
      processedWebhooks.delete(id);
      cleanupCount++;
    }
  });
  
  if (cleanupCount > 0) {
    logger.debug(`Cleaned up ${cleanupCount} expired webhook entries`);
  }
}

// Run cleanup periodically
setInterval(cleanupProcessedWebhooks, 15 * 60 * 1000); // Every 15 minutes

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
    const reqId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    
    logger.info(`[${reqId}] Received webhook on direct Slack endpoint`, {
      body: JSON.stringify(req.body).substring(0, 200),
      headers: req.headers,
    });
    
    // Check if running in production mode
    const isProduction = process.env.NODE_ENV === 'production';
    
    if (isProduction) {
      // In production mode, skip direct Slack webhook processing to avoid duplication
      // as the webhook will be received via SNS with proper deduplication
      logger.info(`[${reqId}] SKIPPING DIRECT SLACK ENDPOINT IN PRODUCTION MODE - USING SNS PATH ONLY`, {
        environment: process.env.NODE_ENV || 'production'
      });
      
      // For verification challenges, we need to send the challenge back
      if (req.body?.type === 'url_verification' && req.body?.challenge) {
        logger.info(`[${reqId}] RESPONDING TO SLACK URL VERIFICATION CHALLENGE`);
        return res.status(200).json({
          challenge: req.body.challenge
        });
      }
      
      // Return 200 immediately so Slack doesn't retry
      return res.status(200).json({
        success: true,
        message: 'Webhook received, but not processed directly in production. Using SNS path only.',
        mode: 'production'
      });
    }
    
    // Use the Slack webhook ID from environment
    const webhookId = env.n8n.slack.webhookId || '09210404-b3f7-48c7-9cd2-07f922bc4b14';
    
    // Generate a stable ID for the webhook
    let stableMessageId;
    
    // Handle different event types
    if (req.body?.event?.type === 'message') {
      // Check for message_changed events
      const isMessageChanged = req.body?.event?.subtype === 'message_changed';
      const originalTs = isMessageChanged ? 
        req.body?.event?.message?.ts || req.body?.event?.previous_message?.ts : 
        req.body?.event?.ts;
        
      stableMessageId = `slack_msg_${req.body?.team_id || ''}_${req.body?.event?.channel || ''}_${originalTs}`;
    } else {
      stableMessageId = req.body?.event_id ? 
        `slack_evt_${req.body.event_id}` : 
        `slack_msg_${req.body?.team_id || ''}_${req.body?.event?.channel || ''}_${req.body?.event?.ts || Date.now()}`;
    }
    
    // Check if this is a duplicate
    if (processedWebhooks.has(stableMessageId)) {
      logger.info(`[${reqId}] Skipping duplicate Slack webhook on direct endpoint`, {
        stableMessageId,
        processingTime: 0
      });
      
      return res.status(200).json({
        success: true,
        message: 'Event already processed',
        id: stableMessageId,
        duplicate: true
      });
    }
    
    // Mark as processed
    processedWebhooks.set(stableMessageId, Date.now());
    
    try {
      // For production, use the production URL pattern
      let webhookUrl = `http://localhost:5678/webhook/${webhookId}/webhook`;
      
      // Add unique ID to the URL query string to force n8n to treat this as unique
      const uniqueId = stableMessageId.replace(/[^a-zA-Z0-9]/g, '').substring(0, 20);
      
      // Append the unique ID as a query parameter to the webhook URL
      webhookUrl = webhookUrl.includes('?') 
        ? `${webhookUrl}&_uid=${uniqueId}` 
        : `${webhookUrl}?_uid=${uniqueId}`;
      
      logger.info(`[${reqId}] Forwarding to n8n on direct Slack endpoint`, {
        webhookUrl,
        stableMessageId
      });
      
      // Forward the payload to n8n, preserving all original headers that might be important
      const forwardHeaders = {
        'Content-Type': req.headers['content-type'] || 'application/json',
        'User-Agent': req.headers['user-agent'] || 'Altiverr-Webhook-Relay',
        'X-Webhook-Source': 'proxy-service',
        'X-Webhook-Type': 'slack',
        'X-Slack-Channel': req.body?.event?.channel || '',
        'X-Slack-Team': req.body?.team_id || '',
        'X-Slack-Event-Type': req.body?.event?.type || '',
        'X-Deduplication-ID': stableMessageId,
        'X-Request-ID': reqId
      };
      
      const response = await axios.post(webhookUrl, req.body, {
        headers: forwardHeaders
      });
      
      logger.info(`[${reqId}] Successfully forwarded manual Slack message to n8n`, {
        statusCode: response.status,
        responseData: response.data,
        messageId: stableMessageId
      });
      
      return res.status(200).json({
        success: true,
        message: 'Message received and forwarded to n8n',
        id: stableMessageId,
        forwardedTo: webhookUrl
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
    const reqId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    
    logger.info(`[${reqId}] RECEIVED WEBHOOK - CALENDLY ENDPOINT`, {
      path: req.path,
      userAgent: req.headers['user-agent'],
      method: req.method,
      contentType: req.headers['content-type'],
      bodyKeys: Object.keys(req.body || {}),
      bodyPreview: JSON.stringify(req.body).substring(0, 300)
    });
    
    // Check if running in production mode
    const isProduction = process.env.NODE_ENV === 'production';
    
    if (isProduction) {
      // In production mode, skip direct Calendly webhook processing to avoid duplication
      // as the webhook will be received via SNS with proper deduplication
      logger.info(`[${reqId}] SKIPPING DIRECT CALENDLY WEBHOOK IN PRODUCTION MODE - USING SNS PATH ONLY`, {
        environment: process.env.NODE_ENV || 'production'
      });
      
      // Return 200 immediately so Calendly doesn't retry
      return res.status(200).json({
        success: true,
        message: 'Webhook received, but not processed directly in production. Using SNS path only.',
        mode: 'production'
      });
    }
    
    const calendlyEventId = req.body?.payload?.uri || 
                          req.body?.payload?.invitee?.uri ||
                          `calendly_${Date.now()}`;
                          
    // Generate a stable ID for deduplication
    const stableEventId = `calendly_${calendlyEventId.split('/').pop()}`;
    
    // Check if this is a duplicate event
    if (processedWebhooks.has(stableEventId)) {
      logger.info('Received duplicate Calendly webhook, skipping', {
        stableEventId,
        path: req.path,
        receivedAt: new Date().toISOString()
      });
      
      return res.status(200).json({
        success: true,
        message: 'Event already processed',
        id: stableEventId,
        duplicate: true
      });
    }
    
    // Mark as processed to prevent duplicates
    processedWebhooks.set(stableEventId, Date.now());
    
    logger.info('Received webhook on direct Calendly endpoint', {
      path: req.path,
      userAgent: req.headers['user-agent'],
      eventId: stableEventId
    });
    
    // Use source-specific webhook URL
    const webhookUrl = getWebhookUrl('', 'calendly');
    
    logger.info('Forwarding Calendly webhook directly to n8n', {
      destination: webhookUrl,
      eventId: stableEventId
    });
    
    // Forward the payload directly to n8n
    const response = await axios.post(webhookUrl, req.body, {
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Source': 'proxy-service',
        'X-Webhook-Type': 'calendly',
        'X-Deduplication-ID': stableEventId
      }
    });
    
    logger.info('Successfully forwarded Calendly webhook to n8n', {
      statusCode: response.status,
      responseData: response.data,
      eventId: stableEventId
    });
    
    return res.status(200).json({
      success: true,
      message: 'Event received',
      id: stableEventId
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
    
    // Check if running in production mode and if this is a Slack webhook
    const isProduction = process.env.NODE_ENV === 'production';
    
    if ((isSlack || isSlackWebhookId) && isProduction) {
      // In production mode, skip direct Slack webhook processing to avoid duplication
      // as the webhook will be received via SNS with proper deduplication
      logger.info(`[${reqId}] SKIPPING DIRECT SLACK WEBHOOK IN PRODUCTION MODE - USING SNS PATH ONLY`, {
        uuid: req.params.uuid,
        isSlack,
        isSlackWebhookId,
        environment: process.env.NODE_ENV || 'production'
      });
      
      // For verification challenges, we need to send the challenge back
      if (req.body?.type === 'url_verification' && req.body?.challenge) {
        logger.info(`[${reqId}] RESPONDING TO SLACK URL VERIFICATION CHALLENGE`);
        return res.status(200).json({
          challenge: req.body.challenge
        });
      }
      
      // Return 200 immediately so Slack doesn't retry
      return res.status(200).json({
        success: true,
        message: 'Webhook received, but not processed directly in production. Using SNS path only.',
        mode: 'production'
      });
    }
    
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
      
      // Generate a stable webhook ID for deduplication
      let stableWebhookId;
      
      // SLACK MESSAGE DETAILS logging
      if (req.body?.event?.type === 'message') {
        // Check for message_changed events and store original ts for deduplication
        const isMessageChanged = req.body?.event?.subtype === 'message_changed';
        const originalTs = isMessageChanged ? 
          req.body?.event?.message?.ts || req.body?.event?.previous_message?.ts : 
          req.body?.event?.ts;
        
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
          eventTs: req.body?.event?.ts,
          isMessageChanged,
          originalTs
        });
        
        // For all message events, use a stable ID based on team, channel and timestamp
        stableWebhookId = `slack_msg_${req.body?.team_id || ''}_${req.body?.event?.channel || ''}_${originalTs}`;
        
        // For message_changed events, log that we're using the original timestamp
        if (isMessageChanged) {
          logger.info(`[${reqId}] USING ORIGINAL TS FOR MESSAGE_CHANGED DEDUPLICATION`, {
            originalTs,
            newStableId: stableWebhookId
          });
        }
      } else {
        // For non-message events, use event_id if available, or generate from ts
        stableWebhookId = req.body?.event_id ? 
          `slack_evt_${req.body.event_id}` : 
          `slack_msg_${req.body?.team_id || ''}_${req.body?.event?.channel || ''}_${req.body?.event?.ts || Date.now()}`;
      }
      
      // Check if this webhook has already been processed
      if (processedWebhooks.has(stableWebhookId)) {
        logger.info(`[${reqId}] SKIPPING DUPLICATE SLACK WEBHOOK`, {
          stableWebhookId,
          eventType: req.body?.event?.type,
          eventTs: req.body?.event?.ts,
          processingTime: Date.now() - startTime
        });
        
        return res.status(200).json({
          success: true,
          message: 'Event already processed',
          id: stableWebhookId,
          duplicate: true
        });
      }
      
      // Mark as processed to prevent duplicates
      processedWebhooks.set(stableWebhookId, Date.now());
      
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
        let webhookUrl = `http://localhost:5678/webhook/${req.params.uuid}/webhook`;
        
        // Add unique ID to the URL query string to force n8n to treat this as unique
        const uniqueId = stableWebhookId.replace(/[^a-zA-Z0-9]/g, '').substring(0, 20);
        
        // Append the unique ID as a query parameter to the webhook URL
        webhookUrl = webhookUrl.includes('?') 
          ? `${webhookUrl}&_uid=${uniqueId}` 
          : `${webhookUrl}?_uid=${uniqueId}`;
        
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
        
        // Define fallback payload here to fix undefined reference
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
    
    // Check if running in production mode and if this is a Slack webhook
    const isProduction = process.env.NODE_ENV === 'production';
    
    if ((isSlack || isSlackWebhookId) && isProduction) {
      // In production mode, skip direct Slack webhook processing to avoid duplication
      // as the webhook will be received via SNS with proper deduplication
      logger.info(`[${reqId}] SKIPPING DIRECT PATH SLACK WEBHOOK IN PRODUCTION MODE - USING SNS PATH ONLY`, {
        uuid: req.params.uuid,
        isSlack,
        isSlackWebhookId,
        environment: process.env.NODE_ENV || 'production'
      });
      
      // For verification challenges, we need to send the challenge back
      if (req.body?.type === 'url_verification' && req.body?.challenge) {
        logger.info(`[${reqId}] RESPONDING TO SLACK URL VERIFICATION CHALLENGE`);
        return res.status(200).json({
          challenge: req.body.challenge
        });
      }
      
      // Return 200 immediately so Slack doesn't retry
      return res.status(200).json({
        success: true,
        message: 'Webhook received, but not processed directly in production. Using SNS path only.',
        mode: 'production'
      });
    }
    
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
      
      // Generate a stable webhook ID for deduplication
      let stableWebhookId;
      
      // SLACK MESSAGE DETAILS logging
      if (req.body?.event?.type === 'message') {
        // Check for message_changed events and store original ts for deduplication
        const isMessageChanged = req.body?.event?.subtype === 'message_changed';
        const originalTs = isMessageChanged ? 
          req.body?.event?.message?.ts || req.body?.event?.previous_message?.ts : 
          req.body?.event?.ts;
        
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
          eventTs: req.body?.event?.ts,
          isMessageChanged,
          originalTs
        });
        
        // For message_changed events, use the original message ts in the ID to avoid duplicates
        if (isMessageChanged) {
          stableWebhookId = `slack_msg_${req.body?.team_id || ''}_${req.body?.event?.channel || ''}_${originalTs}`;
          logger.info(`[${reqId}] USING ORIGINAL TS FOR MESSAGE_CHANGED DEDUPLICATION`, {
            originalTs,
            newStableId: stableWebhookId
          });
        }
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
        
        // Add unique ID to the URL query string to force n8n to treat this as unique
        const uniqueId = stableWebhookId.replace(/[^a-zA-Z0-9]/g, '').substring(0, 20);
        
        // Append the unique ID as a query parameter to the webhook URL
        const finalUrl = webhookUrl.includes('?') 
          ? `${webhookUrl}&_uid=${uniqueId}` 
          : `${webhookUrl}?_uid=${uniqueId}`;
        
        logger.info(`[${reqId}] FORWARDING SLACK WEBHOOK TO N8N`, {
          targetUrl: finalUrl,
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
          url: finalUrl,
          headers: JSON.stringify(forwardHeaders),
          payloadSize: JSON.stringify(payloadToSend).length,
          payloadPreview: JSON.stringify(payloadToSend).substring(0, 300)
        });
        
        const response = await axios.post(finalUrl, payloadToSend, {
          headers: forwardHeaders
        });
        
        const processingTime = Date.now() - startTime;
        
        logger.info(`[${reqId}] SUCCESSFULLY FORWARDED TO N8N`, {
          statusCode: response.status,
          responseData: JSON.stringify(response.data),
          webhookUrl: finalUrl,
          isUserMessage,
          webhookId,
          processingTime: `${processingTime}ms`
        });
        
        return res.status(200).json({
          success: true,
          message: 'Event received and forwarded to n8n production webhook',
          id: webhookId,
          forwardedTo: finalUrl,
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

/**
 * More precise detection of webhook types
 * Returns 'slack', 'slack-sns', 'calendly', or null
 */
function detectWebhookType(req) {
  logger.debug(`Detecting webhook type for request path: ${req.path}`, {
    bodyKeys: Object.keys(req.body || {}),
    userAgent: req.headers['user-agent'],
    hasSNSMessage: !!req.body?.Message && typeof req.body.Message === 'string'
  });
  
  // First check for SNS message format that contains Slack data
  if (
    // Check for SNS format message field
    req.body?.Message && 
    typeof req.body.Message === 'string' &&
    (
      // Check for SNS user agent
      req.headers['user-agent']?.includes('Amazon SNS') ||
      // Or just look for SNS structure in the message
      req.body.Message.includes('"source":"slack"')
    )
  ) {
    logger.debug(`Detected potential SNS message, attempting to parse`, {
      messageLength: req.body.Message.length,
      messagePreview: req.body.Message.substring(0, 150)
    });
    
    try {
      // Try to parse and see if it contains slack data
      const message = JSON.parse(req.body.Message);
      
      logger.debug(`Parsed SNS message structure:`, {
        hasData: !!message.data,
        hasMetadata: !!message.data?.metadata,
        hasPayload: !!message.data?.payload,
        source: message.data?.metadata?.source
      });
      
      if (message.data?.metadata?.source === 'slack') {
        logger.info(`Detected SNS message containing Slack data`, {
          headers: req.headers,
          messageDataKeys: Object.keys(message.data || {}),
          hasOriginal: !!message.data?.payload?.original
        });
        return 'slack-sns';
      }
    } catch (error) {
      // Not a valid JSON string, continue with other checks
      logger.warn('SNS Message field contained invalid JSON', {
        messagePreview: req.body.Message.substring(0, 100),
        error: error.message
      });
    }
  }
  
  // SLACK DETECTION - multiple strong indicators
  if (
    // Header-based detection (strongest)
    req.headers['x-slack-signature'] ||
    req.headers['x-slack-request-timestamp'] ||
    
    // Payload-based detection (strong)
    req.body?.type === 'event_callback' ||
    req.body?.type === 'url_verification' ||
    
    // User agent detection (weaker)
    req.headers['user-agent']?.includes('Slackbot')
  ) {
    return 'slack';
  }
  
  // CALENDLY DETECTION - multiple strong indicators
  if (
    // Header-based detection (strong)
    req.headers['calendly-webhook-signature'] ||
    
    // Payload-based detection (strong)
    req.body?.event === 'invitee.created' ||
    req.body?.event === 'invitee.canceled' ||
    
    // Structure-based detection
    (req.body?.event && req.body?.payload?.event_type?.uri) ||
    
    // User agent detection (weaker, but specific)
    req.headers['user-agent']?.includes('Calendly')
  ) {
    return 'calendly';
  }
  
  // Could not determine with confidence
  return null;
}

export default router; 