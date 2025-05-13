import crypto from 'crypto';
import env from '../config/env.js';
import logger from '../utils/logger.js';
import { generateWebhookMetadata } from '../utils/idGenerator.js';
import { publishToSns } from './sns.service.js';

/**
 * Verify Slack webhook signature
 * https://api.slack.com/authentication/verifying-requests-from-slack
 * 
 * @param {Object} req - Express request object
 * @returns {boolean} True if signature is valid or not required
 */
export function verifySlackSignature(req) {
  // Skip verification if no secret is configured
  if (!env.slack.signingSecret) {
    logger.warn('Slack webhook signature verification skipped - no signing secret configured');
    return true;
  }
  
  try {
    const slackSignature = req.headers['x-slack-signature'];
    const slackTimestamp = req.headers['x-slack-request-timestamp'];
    
    if (!slackSignature || !slackTimestamp) {
      logger.warn('Slack webhook signature or timestamp missing');
      return false;
    }
    
    // Check timestamp to prevent replay attacks (within 5 minutes)
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - slackTimestamp) > 300) {
      logger.warn('Slack webhook timestamp is too old');
      return false;
    }
    
    // Get the raw body as a string
    const rawBody = JSON.stringify(req.body);
    
    // Create the Slack base string
    const baseString = `v0:${slackTimestamp}:${rawBody}`;
    
    // Create HMAC with Slack signing secret
    const hmac = crypto.createHmac('sha256', env.slack.signingSecret);
    hmac.update(baseString);
    const calculatedSignature = `v0=${hmac.digest('hex')}`;
    
    // Compare signatures (constant-time comparison to prevent timing attacks)
    return crypto.timingSafeEqual(
      Buffer.from(calculatedSignature),
      Buffer.from(slackSignature)
    );
  } catch (error) {
    logger.error('Slack signature verification failed', { error: error.message });
    return false;
  }
}

/**
 * Extract useful information from a Slack message event
 * @param {Object} event - Slack event object
 * @returns {Object} Extracted message data
 */
function extractMessageDetails(event) {
  if (!event || event.type !== 'message') {
    return null;
  }

  return {
    channelId: event.channel,
    channelType: event.channel_type,
    messageText: event.text,
    userId: event.user,
    messageTs: event.ts,
    threadTs: event.thread_ts,
    isThreaded: !!event.thread_ts,
    // Extract attachments and files if present
    hasAttachments: Array.isArray(event.attachments) && event.attachments.length > 0,
    attachments: event.attachments || [],
    hasFiles: Array.isArray(event.files) && event.files.length > 0,
    files: event.files || []
  };
}

/**
 * Normalize Slack webhook data into a standard format
 * @param {Object} data - The raw Slack webhook data
 * @returns {Object} Normalized webhook data
 */
export function normalizeSlackData(data) {
  // Add source identifier
  const source = 'slack';
  
  // Generate metadata for tracking
  const metadata = generateWebhookMetadata(source);
  
  // Extract key information
  const eventType = data.type || 'slack.event';
  const timestamp = data.event_time 
    ? new Date(data.event_time * 1000).toISOString() 
    : new Date().toISOString();
  
  // Extract message details if this is a message event
  const messageDetails = data.event?.type === 'message' 
    ? extractMessageDetails(data.event) 
    : null;
  
  // Create normalized format with additional properties to help n8n find what it needs
  return {
    metadata,
    event: {
      name: data.event?.type || 'unknown',
      type: eventType,
      time: timestamp
    },
    // Add critical Slack properties at the top level to ensure they're accessible for n8n
    channel: data.event?.channel || null,  // Important: n8n Slack trigger needs this
    team_id: data.team_id || null,
    text: data.event?.text || null,
    
    payload: {
      original: data,
      teamId: data.team_id,
      apiAppId: data.api_app_id,
      event: data.event,
      eventId: data.event_id,
      eventTime: data.event_time,
      // Include message details if available
      messageDetails
    }
  };
}

/**
 * Process a Slack webhook and publish to SNS
 * @param {Object} data - The Slack webhook data
 * @returns {Promise<Object>} Processing result
 */
export async function processSlackWebhook(data) {
  try {
    // Handle Slack URL verification challenge (required for setup)
    if (data.type === 'url_verification') {
      logger.info('Received Slack URL verification challenge');
      return {
        success: true,
        challenge: data.challenge,
        isChallenge: true
      };
    }
    
    // Log event type for debugging
    if (data.event && data.event.type) {
      logger.info(`Processing Slack event: ${data.event.type}`, {
        subtype: data.event.subtype || 'none',
        channel_type: data.event.channel_type || 'unknown'
      });
    }
    
    // Add debug logging for SNS publishing process
    logger.debug('Preparing to publish Slack webhook to SNS', {
      dataType: typeof data,
      hasEvent: !!data.event,
      eventType: data.event?.type,
      keyCount: Object.keys(data).length,
      keys: Object.keys(data).join(',')
    });
    
    // Normalize the Slack data
    const normalizedData = normalizeSlackData(data);
    
    logger.debug('Normalized Slack data for SNS', {
      id: normalizedData.metadata.id,
      source: normalizedData.metadata.source,
      eventName: normalizedData.event.name,
      hasChannel: !!normalizedData.channel,
      channel: normalizedData.channel,
      hasTeamId: !!normalizedData.team_id
    });
    
    // Publish to SNS using the generated ID for idempotency
    try {
      const result = await publishToSns(
        normalizedData, 
        normalizedData.metadata.id
      );
      
      logger.debug('Successfully published Slack webhook to SNS', {
        messageId: result.messageId,
        requestId: normalizedData.metadata.id
      });
      
      return {
        success: true,
        message: 'Slack webhook processed successfully',
        id: normalizedData.metadata.id,
        snsMessageId: result.messageId
      };
    } catch (snsError) {
      logger.error('Error publishing Slack webhook to SNS', {
        error: snsError.message,
        stack: snsError.stack,
        metadataId: normalizedData.metadata.id
      });
      throw snsError;
    }
  } catch (error) {
    logger.error('Failed to process Slack webhook', { error: error.message });
    throw error;
  }
}

export default {
  verifySlackSignature,
  normalizeSlackData,
  processSlackWebhook
}; 