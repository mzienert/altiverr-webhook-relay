import axios from 'axios';
import crypto from 'crypto';
import AWS from 'aws-sdk';
import env from '../../config/env.js';
import logger from '../utils/logger.js';
import { forwardToN8n } from '../services/n8n.service.js';
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
  try {
    const message = req.body;
    
    if (!message || !message.Message) {
      throw new Error('Invalid SNS notification: missing Message');
    }
    
    // Verify the signature
    if (!verifySnsMessageSignature(message)) {
      logger.warn('SNS message signature verification failed');
      return res.status(400).json({
        error: 'Invalid SNS message signature'
      });
    }
    
    let parsedMessage;
    try {
      parsedMessage = JSON.parse(message.Message);
    } catch (error) {
      logger.error('Error parsing SNS message', { error: error.message });
      throw new Error('Failed to parse SNS message: ' + error.message);
    }
    
    // Check for duplicate messages (idempotency)
    const messageId = parsedMessage.id || message.MessageId;
    if (hasMessageBeenProcessed(messageId)) {
      logger.info('Skipping duplicate SNS message', { messageId });
      return res.status(200).json({
        message: 'Message already processed',
        messageId
      });
    }
    
    // Process the message by forwarding to n8n
    const result = await forwardToN8n(parsedMessage);
    
    // Mark as processed
    markMessageAsProcessed(messageId);
    
    logger.info('Successfully processed SNS notification', {
      messageId,
      result: result.success ? 'success' : 'failure',
      statusCode: result.statusCode
    });
    
    return res.status(200).json({
      success: result.success,
      messageId,
      forwarded: true
    });
  } catch (error) {
    logger.error('Error processing SNS notification', { error: error.message });
    
    // Notify about the error
    sendErrorNotification('Failed to process SNS notification', {
      error: error.message,
      stack: error.stack
    });
    
    return res.status(500).json({
      error: 'Failed to process notification',
      message: error.message
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
  // Super verbose logging
  logger.debug('******* RAW SNS REQUEST RECEIVED *******');
  logger.debug('Headers:', req.headers);
  logger.debug('Body type:', typeof req.body);
  logger.debug('Body value:', req.body);
  logger.debug('Raw body if available:', req.rawBody);
  logger.debug('URL:', req.url);
  logger.debug('Method:', req.method);
  logger.debug('***************************************');
  
  // Add detailed logging
  logger.debug('Received request to SNS endpoint', {
    headers: req.headers,
    contentType: req.headers['content-type'],
    contentLength: req.headers['content-length'],
    method: req.method,
    rawBody: typeof req.body === 'string' ? req.body : JSON.stringify(req.body)
  });
  
  // Try parsing the body in different ways
  let parsedBody = req.body;
  
  // If body is string, try to parse as JSON
  if (typeof req.body === 'string') {
    try {
      parsedBody = JSON.parse(req.body);
      logger.debug('Successfully parsed string body as JSON', { parsedBody });
    } catch (error) {
      logger.error('Failed to parse text body as JSON', { 
        error: error.message, 
        body: req.body 
      });
    }
  }
  
  // If body is buffer, try to parse as string then JSON
  if (Buffer.isBuffer(req.body)) {
    try {
      const bodyString = req.body.toString('utf8');
      logger.debug('Converted Buffer to string', { bodyString });
      
      try {
        parsedBody = JSON.parse(bodyString);
        logger.debug('Successfully parsed buffer body as JSON', { parsedBody });
      } catch (innerError) {
        logger.error('Failed to parse buffer as JSON', { 
          error: innerError.message, 
          body: bodyString 
        });
      }
    } catch (error) {
      logger.error('Failed to convert buffer to string', { 
        error: error.message 
      });
    }
  }
  
  // Use the parsed body if we have one
  if (parsedBody && typeof parsedBody === 'object') {
    req.body = parsedBody;
  }
  
  const messageType = req.headers['x-amz-sns-message-type'] || 
                      (req.body && req.body.Type);
  
  logger.debug('Received SNS message', { 
    type: messageType,
    body: req.body
  });
  
  // If no message type found in headers or body, try to determine from structure
  if (!messageType && req.body) {
    if (req.body.SubscribeURL && req.body.TopicArn) {
      logger.debug('Detected SubscriptionConfirmation from body structure');
      return handleSubscriptionConfirmation(req, res);
    } else if (req.body.Message && req.body.MessageId) {
      logger.debug('Detected Notification from body structure');
      return handleNotification(req, res);
    }
  }
  
  switch (messageType) {
    case 'SubscriptionConfirmation':
      return handleSubscriptionConfirmation(req, res);
      
    case 'Notification':
      return handleNotification(req, res);
      
    case 'UnsubscribeConfirmation':
      return handleUnsubscribeConfirmation(req, res);
      
    default:
      logger.warn('Received unknown SNS message type', { 
        type: messageType,
        headers: req.headers,
        body: req.body
      });
      return res.status(400).json({
        error: 'Unsupported message type',
        type: messageType || 'unknown'
      });
  }
}

export default {
  handleSnsMessage,
  handleSubscriptionConfirmation,
  handleNotification,
  handleUnsubscribeConfirmation
}; 