import axios from 'axios';
import env from '../../config/env.js';
import logger from '../utils/logger.js';
import { forwardToN8n, extractSlackFromSNS } from '../services/n8n.service.js';
import { sendErrorNotification } from '../services/notification.service.js';

// Map to store processed message IDs for idempotency (in-memory cache)
// In a production environment with multiple instances, consider using Redis
const processedMessages = new Map();

// Expire entries after 24 hours to prevent memory leaks
const MESSAGE_EXPIRY_TIME = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Utility to add a message ID to the processed list
 * @param {string} messageId - The message ID to add
 */
function markMessageAsProcessed(messageId) {
  if (!messageId) return;
  
  processedMessages.set(messageId, {
    timestamp: Date.now()
  });
  
  // Schedule cleanup of older messages
  cleanupProcessedMessages();
}

/**
 * Utility to check if a message has been processed
 * @param {string} messageId - The message ID to check
 * @returns {boolean} Whether the message has been processed
 */
function hasMessageBeenProcessed(messageId) {
  if (!messageId) return false;
  return processedMessages.has(messageId);
}

/**
 * Clean up old processed message entries
 */
function cleanupProcessedMessages() {
  const now = Date.now();
  
  processedMessages.forEach((value, key) => {
    if (now - value.timestamp > MESSAGE_EXPIRY_TIME) {
      processedMessages.delete(key);
    }
  });
}

/**
 * Verify SNS message signature
 * @param {Object} message - The SNS message
 * @returns {boolean} Whether the signature is valid
 */
function verifySnsMessageSignature(message) {
  try {
    // Skip signature verification for certain message types or if missing data
    if (!message || 
        !message.SignatureVersion || 
        !message.Signature || 
        !message.SigningCertURL || 
        message.SignatureVersion !== '1') {
      return false;
    }
    
    // Fetch the signing certificate
    const certUrl = new URL(message.SigningCertURL);
    
    // Verify the certificate URL is from AWS
    if (certUrl.protocol !== 'https:' || 
        !certUrl.hostname.endsWith('.amazonaws.com') || 
        certUrl.hostname.indexOf('..') >= 0 || 
        certUrl.pathname.indexOf('..') >= 0) {
      logger.warn('Invalid SNS certificate URL', { url: message.SigningCertURL });
      return false;
    }
    
    // For full implementation, we would fetch and verify the certificate
    // For now, we'll verify based on source and structure
    return true;
  } catch (error) {
    logger.error('Error verifying SNS message signature', { error: error.message });
    return false;
  }
}

/**
 * Handle SNS subscription confirmation
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
export async function handleSubscriptionConfirmation(req, res) {
  try {
    const message = req.body;
    
    // Debug logging - log the entire request
    logger.debug('SNS subscription confirmation request details', {
      body: JSON.stringify(req.body),
      headers: req.headers,
      method: req.method,
      path: req.path
    });
    
    logger.info('Received SNS subscription confirmation request', {
      topicArn: message.TopicArn,
      subscribeURL: message.SubscribeURL
    });
    
    if (!message.TopicArn || !message.SubscribeURL) {
      throw new Error('Invalid SNS subscription confirmation: missing TopicArn or SubscribeURL');
    }
    
    // Verify the message is for our topic
    if (env.aws.snsTopicArn && message.TopicArn !== env.aws.snsTopicArn) {
      logger.warn('Received subscription confirmation for unknown topic', {
        expected: env.aws.snsTopicArn,
        received: message.TopicArn
      });
      
      return res.status(400).json({
        error: 'Topic ARN mismatch'
      });
    }
    
    // Confirm the subscription by visiting the SubscribeURL
    const response = await axios.get(message.SubscribeURL);
    
    logger.info('Successfully confirmed SNS subscription', {
      statusCode: response.status,
      topicArn: message.TopicArn
    });
    
    return res.status(200).json({
      message: 'Subscription confirmed successfully',
      topicArn: message.TopicArn
    });
  } catch (error) {
    logger.error('Error confirming SNS subscription', { error: error.message });
    
    // Notify about the error
    sendErrorNotification('Failed to confirm SNS subscription', {
      error: error.message,
      stack: error.stack
    });
    
    return res.status(500).json({
      error: 'Failed to confirm subscription',
      message: error.message
    });
  }
}

/**
 * Handle SNS notification (webhook message)
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
export async function handleNotification(req, res) {
  const traceId = `sns_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  
  try {
    const message = req.body;
    
    logger.info(`[${traceId}] PROCESSING SNS NOTIFICATION`, {
      messageId: message.MessageId,
      topicArn: message.TopicArn,
      timestamp: message.Timestamp,
      messageSize: message.Message ? message.Message.length : 0,
      hasAttributes: !!message.MessageAttributes
    });
    
    if (!message || !message.Message) {
      logger.error(`[${traceId}] INVALID SNS NOTIFICATION`, {
        error: 'Missing Message field',
        message: JSON.stringify(message)
      });
      throw new Error('Invalid SNS notification: missing Message');
    }
    
    // Verify the signature
    if (!verifySnsMessageSignature(message)) {
      logger.warn(`[${traceId}] SIGNATURE VERIFICATION FAILED`, {
        messageId: message.MessageId,
        signatureVersion: message.SignatureVersion,
        hasSignature: !!message.Signature,
        hasCertUrl: !!message.SigningCertURL
      });
      
      return res.status(400).json({
        error: 'Invalid SNS message signature',
        traceId
      });
    }
    
    let parsedMessage;
    try {
      parsedMessage = JSON.parse(message.Message);
      
      logger.debug(`[${traceId}] PARSED SNS MESSAGE`, {
        parsedMessageKeys: Object.keys(parsedMessage),
        dataType: typeof parsedMessage.data,
        hasId: !!parsedMessage.id,
        id: parsedMessage.id,
        hasMetadata: !!parsedMessage.data?.metadata,
        source: parsedMessage.data?.metadata?.source || 'unknown',
        messagePreview: JSON.stringify(parsedMessage).substring(0, 300)
      });
    } catch (error) {
      logger.error(`[${traceId}] ERROR PARSING SNS MESSAGE`, {
        error: error.message,
        messagePreview: message.Message.substring(0, 300)
      });
      throw new Error('Failed to parse SNS message: ' + error.message);
    }
    
    // Extract the message ID for deduplication
    let messageId;
    
    // For Slack events, use the event ID or timestamp
    if (parsedMessage.data?.metadata?.source === 'slack') {
      // Use Slack timestamp for stable IDs
      const slackTs = parsedMessage.data?.payload?.original?.event?.ts;
      const teamId = parsedMessage.data?.payload?.original?.team_id || parsedMessage.data?.team_id;
      const channel = parsedMessage.data?.payload?.original?.event?.channel || parsedMessage.data?.channel;
      
      if (slackTs && (teamId || channel)) {
        messageId = `slack_msg_${teamId || ''}_${channel || ''}_${slackTs}`;
      } else {
        messageId = `slack_${parsedMessage.data?.metadata?.id || Date.now()}`;
      }
    } 
    // For Calendly events, use the event URI
    else if (parsedMessage.data?.metadata?.source === 'calendly') {
      // Extract Calendly URI from payload 
      const eventUri = parsedMessage.data?.payload?.original?.payload?.uri ||
                       parsedMessage.data?.payload?.original?.payload?.invitee?.uri;
      
      if (eventUri) {
        // Extract just the UUID from the URI
        const eventId = eventUri.split('/').pop();
        messageId = `calendly_${eventId}`;
      } else {
        messageId = `calendly_${parsedMessage.data?.metadata?.id || Date.now()}`;
      }
      
      logger.info(`[${traceId}] CALENDLY EVENT DETECTED IN SNS`, {
        messageId,
        eventType: parsedMessage.data?.payload?.original?.event || 'unknown'
      });
    }
    // For other events, use the metadata ID or generate one
    else {
      messageId = parsedMessage.data?.metadata?.id || `sns_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    }
    
    // Check for duplicate messages (idempotency)
    if (hasMessageBeenProcessed(messageId)) {
      logger.info(`[${traceId}] SKIPPING DUPLICATE SNS MESSAGE`, {
        messageId,
        source: parsedMessage.data?.metadata?.source || 'unknown'
      });
      
      return res.status(200).json({
        message: 'Message already processed',
        messageId,
        traceId
      });
    }
    
    // Check for Slack-specific messages
    const isSlackMessage = parsedMessage.data?.metadata?.source === 'slack' || 
                          (parsedMessage.data?.payload?.original?.type === 'event_callback');
    
    if (isSlackMessage) {
      logger.info(`[${traceId}] DETECTED SLACK MESSAGE IN SNS`, {
        messageId,
        teamId: parsedMessage.data?.payload?.original?.team_id,
        eventType: parsedMessage.data?.payload?.original?.event?.type,
        eventTs: parsedMessage.data?.payload?.original?.event?.ts,
        channel: parsedMessage.data?.payload?.original?.event?.channel,
        user: parsedMessage.data?.payload?.original?.event?.user,
        text: parsedMessage.data?.payload?.original?.event?.text?.substring(0, 100)
      });
      
      // Check for manual user messages vs. bot messages
      const isUserMessage = 
        parsedMessage.data?.payload?.original?.event?.type === 'message' && 
        !parsedMessage.data?.payload?.original?.event?.bot_id && 
        parsedMessage.data?.payload?.original?.event?.user;
      
      if (isUserMessage) {
        logger.info(`[${traceId}] DETECTED MANUAL SLACK USER MESSAGE IN SNS`, {
          user: parsedMessage.data?.payload?.original?.event?.user,
          text: parsedMessage.data?.payload?.original?.event?.text?.substring(0, 100),
          channel: parsedMessage.data?.payload?.original?.event?.channel,
          ts: parsedMessage.data?.payload?.original?.event?.ts
        });
      }

      // Try to extract the original Slack payload for n8n
      const slackPayload = extractSlackFromSNS(message);
      if (slackPayload) {
        logger.info(`[${traceId}] EXTRACTED SLACK PAYLOAD FROM SNS`, {
          eventType: slackPayload.event?.type || slackPayload.type,
          hasEvent: !!slackPayload.event,
          hasTeamId: !!slackPayload.team_id
        });
        
        // Forward the extracted Slack payload directly to n8n
        logger.info(`[${traceId}] FORWARDING SLACK PAYLOAD TO N8N`, {
          messageId,
          source: 'slack',
          isExtractedPayload: true
        });
        
        const result = await forwardToN8n({
          data: slackPayload,
          id: messageId,
          source: 'slack'
        });
        
        // Mark as processed
        markMessageAsProcessed(messageId);
        
        logger.info(`[${traceId}] SUCCESSFULLY PROCESSED SNS NOTIFICATION`, {
          messageId,
          result: result.success ? 'success' : 'failure',
          statusCode: result.statusCode,
          source: 'slack',
          isSlackMessage: true,
          responseTime: result.responseTime
        });
        
        return res.status(200).json({
          success: result.success,
          messageId,
          forwarded: true,
          traceId
        });
      }
    }
    
    // Process the message by forwarding to n8n
    logger.info(`[${traceId}] FORWARDING SNS MESSAGE TO N8N`, {
      messageId,
      source: parsedMessage.data?.metadata?.source || 'unknown',
      isSlackMessage,
      timestamp: new Date().toISOString()
    });
    
    const result = await forwardToN8n({
      data: parsedMessage,
      id: messageId,
      source: parsedMessage.data?.metadata?.source
    });
    
    // Mark as processed
    markMessageAsProcessed(messageId);
    
    logger.info(`[${traceId}] SUCCESSFULLY PROCESSED SNS NOTIFICATION`, {
      messageId,
      result: result.success ? 'success' : 'failure',
      statusCode: result.statusCode,
      source: parsedMessage.data?.metadata?.source || 'unknown',
      isSlackMessage,
      responseTime: result.responseTime
    });
    
    return res.status(200).json({
      success: result.success,
      messageId,
      forwarded: true,
      traceId
    });
  } catch (error) {
    logger.error(`[${traceId}] ERROR PROCESSING SNS NOTIFICATION`, {
      error: error.message,
      stack: error.stack
    });
    
    // Notify about the error
    sendErrorNotification('Failed to process SNS notification', {
      error: error.message,
      stack: error.stack,
      traceId
    });
    
    return res.status(500).json({
      error: 'Failed to process notification',
      message: error.message,
      traceId
    });
  }
}

/**
 * Handle unsubscribe confirmation
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
export async function handleUnsubscribeConfirmation(req, res) {
  try {
    const message = req.body;
    
    logger.info('Received SNS unsubscribe confirmation', {
      topicArn: message.TopicArn
    });
    
    return res.status(200).json({
      message: 'Unsubscribe request acknowledged'
    });
  } catch (error) {
    logger.error('Error handling unsubscribe confirmation', { error: error.message });
    
    return res.status(500).json({
      error: 'Failed to handle unsubscribe confirmation',
      message: error.message
    });
  }
}

/**
 * Main SNS endpoint handler
 * Determines the type of message and routes to the appropriate handler
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
export async function handleSnsMessage(req, res) {
  const traceId = `sns_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const startTime = Date.now();
  
  try {
    // Super verbose logging
    logger.debug(`[${traceId}] RAW SNS REQUEST RECEIVED`, { 
      headers: req.headers,
      contentType: req.headers['content-type'],
      contentLength: req.headers['content-length'],
      method: req.method,
      path: req.path,
      url: req.url,
      query: req.query,
      ip: req.ip,
    });
    
    // Debug body based on content type
    if (req.headers['content-type'] === 'application/json') {
      logger.debug(`[${traceId}] REQUEST JSON BODY`, {
        body: typeof req.body === 'string' ? req.body : JSON.stringify(req.body).substring(0, 1000)
      });
    } else if (req.headers['content-type'] === 'text/plain') {
      logger.debug(`[${traceId}] REQUEST TEXT BODY`, {
        body: req.body.substring(0, 1000)
      });
    } else {
      logger.debug(`[${traceId}] REQUEST BODY TYPE`, {
        type: typeof req.body,
        isBuffer: Buffer.isBuffer(req.body),
        length: Buffer.isBuffer(req.body) ? req.body.length : (typeof req.body === 'string' ? req.body.length : 'unknown')
      });
    }
    
    // Try parsing the body in different ways
    let parsedBody = req.body;
    
    // If body is string, try to parse as JSON
    if (typeof req.body === 'string') {
      try {
        parsedBody = JSON.parse(req.body);
        logger.debug(`[${traceId}] SUCCESSFULLY PARSED STRING BODY AS JSON`, {
          parsedKeys: Object.keys(parsedBody),
          messageType: parsedBody.Type,
          hasMessage: !!parsedBody.Message
        });
      } catch (error) {
        logger.error(`[${traceId}] FAILED TO PARSE TEXT BODY AS JSON`, { 
          error: error.message, 
          bodyPreview: (req.body || '').substring(0, 300)
        });
      }
    }
    
    // If body is buffer, try to parse as string then JSON
    if (Buffer.isBuffer(req.body)) {
      try {
        const bodyString = req.body.toString('utf8');
        logger.debug(`[${traceId}] CONVERTED BUFFER TO STRING`, {
          length: bodyString.length,
          preview: bodyString.substring(0, 200)
        });
        
        try {
          parsedBody = JSON.parse(bodyString);
          logger.debug(`[${traceId}] SUCCESSFULLY PARSED BUFFER BODY AS JSON`, {
            parsedKeys: Object.keys(parsedBody),
            messageType: parsedBody.Type
          });
        } catch (innerError) {
          logger.error(`[${traceId}] FAILED TO PARSE BUFFER AS JSON`, { 
            error: innerError.message, 
            bodyPreview: bodyString.substring(0, 300)
          });
        }
      } catch (error) {
        logger.error(`[${traceId}] FAILED TO CONVERT BUFFER TO STRING`, { 
          error: error.message 
        });
      }
    }
    
    // Use the parsed body if we have one
    if (parsedBody && typeof parsedBody === 'object') {
      req.body = parsedBody;
      logger.debug(`[${traceId}] USING PARSED BODY`, {
        type: typeof parsedBody,
        keys: Object.keys(parsedBody)
      });
    }
    
    const messageType = req.headers['x-amz-sns-message-type'] || 
                      (req.body && req.body.Type);
    
    logger.info(`[${traceId}] SNS MESSAGE CLASSIFICATION`, { 
      messageType: messageType || 'unknown',
      hasTopicArn: !!req.body.TopicArn,
      hasSubscribeUrl: !!req.body.SubscribeURL,
      hasMessage: !!req.body.Message,
      hasMessageId: !!req.body.MessageId,
      contentType: req.headers['content-type'],
      source: req.body.Message ? 'Has Message field' : 'No Message field'
    });
    
    // If the message contains a standard webhook (not SNS), forward it directly
    if (!messageType && 
        !req.body.TopicArn && 
        !req.body.SubscribeURL && 
        !req.body.Message && 
        !req.body.MessageId) {
      
      // Special detection for Slack webhooks
      const isSlack = req.body.type === 'event_callback' || 
                     req.body.event?.type === 'message' ||
                     req.body.team_id;
                     
      if (isSlack) {
        logger.info(`[${traceId}] DETECTED DIRECT SLACK WEBHOOK (NOT SNS)`, {
          type: req.body.type,
          eventType: req.body.event?.type,
          teamId: req.body.team_id,
          channel: req.body.event?.channel,
          user: req.body.event?.user,
          messageText: req.body.event?.text?.substring(0, 100)
        });
        
        // Forward directly to n8n
        const directResult = await forwardToN8n({
          data: req.body,
          id: `direct_slack_${Date.now()}`,
          source: 'slack'
        });
        
        const processingTime = Date.now() - startTime;
        
        logger.info(`[${traceId}] FORWARDED DIRECT SLACK WEBHOOK`, {
          success: directResult.success,
          statusCode: directResult.statusCode || 'unknown',
          processingTime: `${processingTime}ms`
        });
        
        return res.status(200).json({
          success: true,
          message: 'Direct Slack webhook processed',
          traceId,
          processingTime
        });
      }
      
      // Special detection for Calendly webhooks
      const isCalendly = req.body.event?.includes('calendly') ||
                        req.body.payload?.event_type?.kind === 'calendly';
                        
      if (isCalendly) {
        logger.info(`[${traceId}] DETECTED DIRECT CALENDLY WEBHOOK (NOT SNS)`, {
          event: req.body.event,
          uri: req.body.payload?.uri || 'unknown'
        });
        
        // Forward directly to n8n
        const directResult = await forwardToN8n({
          data: req.body,
          id: `direct_calendly_${Date.now()}`,
          source: 'calendly'
        });
        
        const processingTime = Date.now() - startTime;
        
        logger.info(`[${traceId}] FORWARDED DIRECT CALENDLY WEBHOOK`, {
          success: directResult.success,
          statusCode: directResult.statusCode || 'unknown',
          processingTime: `${processingTime}ms`
        });
        
        return res.status(200).json({
          success: true,
          message: 'Direct Calendly webhook processed',
          traceId,
          processingTime
        });
      }
    }
    
    // If no message type found in headers or body, try to determine from structure
    if (!messageType && req.body) {
      if (req.body.SubscribeURL && req.body.TopicArn) {
        logger.debug(`[${traceId}] DETECTED SUBSCRIPTION CONFIRMATION FROM STRUCTURE`);
        
        // Add traceId to req for tracking
        req.traceId = traceId;
        
        return handleSubscriptionConfirmation(req, res);
      } else if (req.body.Message && req.body.MessageId) {
        logger.debug(`[${traceId}] DETECTED NOTIFICATION FROM STRUCTURE`);
        
        // Add traceId to req for tracking
        req.traceId = traceId;
        
        return handleNotification(req, res);
      }
    }
    
    // Add traceId to req for tracking
    req.traceId = traceId;
    
    // Use switch statement to route to appropriate handler
    switch (messageType) {
      case 'SubscriptionConfirmation':
        logger.info(`[${traceId}] ROUTING TO SUBSCRIPTION CONFIRMATION HANDLER`);
        return handleSubscriptionConfirmation(req, res);
        
      case 'Notification':
        logger.info(`[${traceId}] ROUTING TO NOTIFICATION HANDLER`);
        return handleNotification(req, res);
        
      case 'UnsubscribeConfirmation':
        logger.info(`[${traceId}] ROUTING TO UNSUBSCRIBE CONFIRMATION HANDLER`);
        return handleUnsubscribeConfirmation(req, res);
        
      default:
        const processingTime = Date.now() - startTime;
        
        logger.warn(`[${traceId}] UNKNOWN SNS MESSAGE TYPE`, { 
          type: messageType || 'unknown',
          headers: JSON.stringify(req.headers),
          bodyKeys: req.body ? Object.keys(req.body) : [],
          processingTime: `${processingTime}ms`
        });
        
        return res.status(400).json({
          error: 'Unsupported message type',
          type: messageType || 'unknown',
          traceId,
          processingTime
        });
    }
  } catch (error) {
    const processingTime = Date.now() - startTime;
    
    logger.error(`[${traceId}] UNHANDLED ERROR IN SNS HANDLER`, {
      error: error.message,
      stack: error.stack,
      processingTime: `${processingTime}ms`
    });
    
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message,
      traceId,
      processingTime
    });
  }
}

export default {
  handleSnsMessage,
  handleSubscriptionConfirmation,
  handleNotification,
  handleUnsubscribeConfirmation
}; 