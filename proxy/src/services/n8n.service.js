import axios from 'axios';
import env from '../../config/env.js';
import logger from '../utils/logger.js';
import { getWebhookUrl } from '../utils/webhookUrl.js';

// Map to store recently processed webhook IDs to prevent duplicates
const processedWebhooks = new Map();
const WEBHOOK_EXPIRY_TIME = 30 * 60 * 1000; // Increased to 30 minutes from 5 minutes

/**
 * Generates a consistent ID from a Slack webhook payload
 * @param {Object} data - Webhook payload
 * @returns {string} A consistent ID for deduplication
 */
function generateConsistentWebhookId(data) {
  // For Slack message events, use team_id + channel + ts for consistent IDs
  if (data.event?.type === 'message' && data.event?.ts) {
    return `slack_msg_${data.team_id || 'team'}_${data.event.channel || 'channel'}_${data.event.ts}`;
  }
  
  // For Slack events with event_id, use that
  if (data.event_id) {
    return `slack_${data.event_id}`;
  }
  
  // For Calendly events, use the invitee URI or event URI
  if (data.payload?.uri && data.payload.uri.includes('calendly')) {
    return `calendly_${data.payload.uri.split('/').pop()}`;
  }
  
  // For any data with an explicit ID
  if (data.id) {
    return data.id;
  }
  if (data.metadata?.id) {
    return data.metadata.id;
  }
  
  // Fallback: use stringified first 100 chars of payload
  return `webhook_${JSON.stringify(data).slice(0, 100)}`;
}

/**
 * Check if webhook was recently processed to prevent duplicates
 * @param {string} webhookId - Unique ID of the webhook
 * @returns {boolean} - Whether webhook was already processed
 */
function isWebhookProcessed(webhookId) {
  if (!webhookId) return false;
  return processedWebhooks.has(webhookId);
}

/**
 * Mark webhook as processed to prevent duplicates
 * @param {string} webhookId - Unique ID of the webhook
 */
function markWebhookProcessed(webhookId) {
  if (!webhookId) return;
  processedWebhooks.set(webhookId, Date.now());
  
  // Clean up old entries occasionally
  if (processedWebhooks.size > 100) {
    cleanupProcessedWebhooks();
  }
}

/**
 * Clean up expired webhook IDs to prevent memory leaks
 */
function cleanupProcessedWebhooks() {
  const now = Date.now();
  for (const [id, timestamp] of processedWebhooks.entries()) {
    if (now - timestamp > WEBHOOK_EXPIRY_TIME) {
      processedWebhooks.delete(id);
    }
  }
}

/**
 * Detects the type of webhook from the payload data
 * @param {Object} data - The webhook payload data
 * @returns {Object} - Detection result {source, dataType, etc}
 */
function detectWebhookSource(data) {
  // Early return if data is empty or invalid
  if (!data) {
    return { source: 'unknown', dataType: typeof data, dataKeys: [] };
  }
  
  // Extract all data keys for inspection
  const dataType = typeof data;
  const dataKeys = data ? Object.keys(data) : [];
  
  // Log initial inspection
  logger.debug('Inspecting webhook payload for source detection', {
    dataType,
    dataKeys: dataKeys.join(', '),
    sampleData: JSON.stringify(data).substring(0, 200)
  });
  
  // Handle string data (assuming it might be stringified JSON)
  let parsedData = data;
  if (dataType === 'string' && data.trim().startsWith('{')) {
    try {
      parsedData = JSON.parse(data);
      logger.debug('Parsed string data to JSON', {
        dataType: typeof parsedData,
        dataKeys: Object.keys(parsedData)
      });
    } catch (e) {
      // Not valid JSON string, continue with original data
    }
  }
  
  // Special handling for Slack
  // Check for direct Slack message payload structure
  if (parsedData && typeof parsedData === 'object') {
    // Look for common Slack API properties
    const hasSlackType = parsedData.type === 'event_callback' || parsedData.type === 'url_verification';
    const hasEventField = !!parsedData.event;
    const hasEventType = parsedData.event?.type === 'message' || parsedData.event?.type === 'app_mention';
    const hasTeamID = !!parsedData.team_id;
    const hasChannelField = !!parsedData.event?.channel;
    
    // Check if many signs point to this being a Slack webhook
    if ((hasSlackType && hasEventField) || 
        (hasEventField && hasEventType && hasTeamID) ||
        (hasEventField && hasChannelField && hasTeamID)) {
      logger.debug('Detected Slack webhook through standard structure', {
        type: parsedData.type,
        eventType: parsedData.event?.type,
        hasTeamID,
        hasChannelField
      });
      
      // Additional check for manual user messages
      const isUserMessage = parsedData.event?.type === 'message' && 
                           !parsedData.event?.bot_id && 
                           parsedData.event?.user;
                           
      if (isUserMessage) {
        logger.info('Detected manual Slack message from user', {
          user: parsedData.event.user,
          channel: parsedData.event.channel,
          text: parsedData.event.text?.substring(0, 50)
        });
      }
      
      return {
        source: 'slack',
        dataType: typeof parsedData,
        dataKeys,
        isSNS: false,
        hasEvent: hasEventField,
        isManualMessage: isUserMessage
      };
    }
    
    // Check for Slack webhook inside SNS wrapper (typically includes Message field with nested data)
    if (parsedData.Message && typeof parsedData.Message === 'string') {
      try {
        const innerMessage = JSON.parse(parsedData.Message);
        
        // Detect metadata wrapper structure from our SNS implementation
        if (innerMessage && innerMessage.data && innerMessage.data.metadata) {
          const hasMetadata = !!innerMessage.data.metadata;
          const dataKeys = innerMessage.data ? Object.keys(innerMessage.data) : [];
          
          logger.debug('Detected potential SNS wrapper structure', {
            hasMetadata,
            dataKeys
          });
          
          // Check for Slack-specific metadata within SNS message
          if (innerMessage.data.metadata.source === 'slack') {
            logger.debug('Detected Slack webhook through SNS nested structure');
            
            // Extract and process the original Slack payload from the SNS data structure
            const slackPayload = innerMessage.data.payload?.original || {};
            logger.debug('Extracted Slack original payload from SNS data structure');
            
            return {
              source: 'slack',
              dataType: typeof slackPayload,
              dataKeys: Object.keys(slackPayload),
              isSNS: true,
              hasEvent: !!slackPayload.event,
              originalMessage: slackPayload
            };
          }
          
          // Check for Calendly-specific metadata within SNS message
          if (innerMessage.data.metadata.source === 'calendly') {
            logger.debug('Detected Calendly webhook through SNS nested structure');
            
            // Extract and process the original Calendly payload
            const calendlyPayload = innerMessage.data.payload?.original || {};
            logger.debug('Extracted Calendly original payload from SNS data structure');
            
            return {
              source: 'calendly',
              dataType: typeof calendlyPayload,
              dataKeys: Object.keys(calendlyPayload),
              isSNS: true,
              hasEvent: false,
              originalMessage: calendlyPayload
            };
          }
        }
      } catch (e) {
        // Not a valid JSON string in Message field, continue with other checks
      }
    }
    
    // Check for plain Calendly structure (direct webhook)
    if (parsedData.event === 'invitee.created' || 
        parsedData.event === 'invitee.canceled' || 
        (parsedData.payload && parsedData.payload.event_type && parsedData.payload.event_type.kind === 'calendly')) {
      logger.debug('Detected Calendly webhook through standard structure');
      return {
        source: 'calendly',
        dataType: typeof parsedData,
        dataKeys,
        isSNS: false,
        hasEvent: false
      };
    }
  }
  
  // If no specific source detected, return unknown
  return {
    source: 'unknown',
    dataType,
    dataKeys,
    isSNS: false,
    hasEvent: false
  };
}

/**
 * Extract Slack payload from SNS message
 * @param {Object} data - SNS message data
 * @returns {Object} Extracted Slack payload or null if extraction failed
 */
export function extractSlackFromSNS(data) {
  if (!data || !data.Message || typeof data.Message !== 'string') {
    return null;
  }

  try {
    // Parse the SNS Message field
    const parsedMessage = JSON.parse(data.Message);
    
    // Debug the structure
    logger.debug('Parsed SNS message structure:', {
      hasData: !!parsedMessage.data,
      hasMetadata: !!parsedMessage.data?.metadata,
      hasPayload: !!parsedMessage.data?.payload,
      source: parsedMessage.data?.metadata?.source,
      channelPresent: !!parsedMessage.data?.channel,
      teamIdPresent: !!parsedMessage.data?.team_id
    });
    
    // Check if we have the expected structure for Slack
    if (parsedMessage.data?.metadata?.source !== 'slack' || !parsedMessage.data?.payload?.original) {
      return null;
    }
    
    // Extract the Slack payload
    const slackPayload = parsedMessage.data.payload.original;
    
    // Add channel from SNS wrapper if needed
    if (parsedMessage.data.channel && slackPayload.event && !slackPayload.event.channel) {
      slackPayload.event.channel = parsedMessage.data.channel;
    }
    
    // Add team_id if needed
    if (parsedMessage.data.team_id && !slackPayload.team_id) {
      slackPayload.team_id = parsedMessage.data.team_id;
    }
    
    // Ensure event has a channel for Slack trigger
    if (slackPayload.event && !slackPayload.event.channel) {
      slackPayload.event.channel = 'extracted-channel';
    }
    
    return slackPayload;
  } catch (error) {
    logger.error('Failed to extract Slack payload from SNS:', error);
    return null;
  }
}

/**
 * Forward webhook to n8n
 * @param {Object} options - Forwarding options
 * @param {Object} options.data - Webhook data
 * @param {string} options.id - Webhook ID
 * @param {string} options.source - Webhook source
 * @returns {Promise<Object>} - Response from n8n
 */
export async function forwardToN8n({ data, id, source }) {
  const trackingId = `fwd_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  
  try {
    // If data is null or undefined, return immediately
    if (!data) {
      logger.error(`[${trackingId}] N8N FORWARD - NO DATA PROVIDED`, {
        id,
        source
      });
      return { success: false, error: 'No data provided' };
    }
    
    // General webhook ID for deduplication
    const webhookId = id || `webhook_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;

    // Log what we received
    logger.debug(`[${trackingId}] N8N FORWARD - INCOMING DATA`, {
      webhookId,
      dataType: typeof data,
      dataKeys: data ? Object.keys(data) : [],
      providedSource: source,
      providedId: id,
      dataPreview: JSON.stringify(data).substring(0, 300)
    });

    // If the webhook has been processed recently, skip processing
    if (isWebhookProcessed(webhookId)) {
      logger.info(`[${trackingId}] N8N FORWARD - SKIPPING DUPLICATE`, { 
        id: webhookId,
        source,
        receivedAt: new Date().toISOString()
      });
      return { 
        success: true, 
        message: 'Webhook already processed', 
        skipped: true 
      };
    }
    
    // Check for SNS message format first
    let isSnsFormat = false;
    let extractedPayload = null;
    
    if (data.Message && typeof data.Message === 'string') {
      // Try to extract Slack payload from SNS
      extractedPayload = extractSlackFromSNS(data);
      if (extractedPayload) {
        isSnsFormat = true;
        // Override the source
        source = 'slack';
        
        logger.info(`[${trackingId}] N8N FORWARD - EXTRACTED SLACK FROM SNS`, {
          hasEvent: !!extractedPayload.event,
          eventType: extractedPayload.event?.type,
          channel: extractedPayload.event?.channel,
          teamId: extractedPayload.team_id
        });
      }
    }
    
    // Detect webhook source if not provided and not already determined from SNS
    let webhookSource = source ? { source } : detectWebhookSource(data);
    
    // Ensure we have a source property even if directly passing source as string
    if (typeof webhookSource === 'string') {
      webhookSource = { source: webhookSource };
    }

    // Mark webhook as processed to prevent duplicates
    markWebhookProcessed(webhookId);
    
    // Determine n8n webhook URL based on source
    let n8nWebhookUrl = '';
    
    // Use specific URL for slack to fix the routing issue
    if (webhookSource.source === 'slack') {
      const nodeEnv = process.env.NODE_ENV || 'development';
      const slackWebhookId = env.n8n.slack.webhookId || '09210404-b3f7-48c7-9cd2-07f922bc4b14';
      
      logger.info(`[${trackingId}] N8N FORWARD - CONFIGURING SLACK WEBHOOK URL`, {
        nodeEnv,
        slackWebhookId,
        configuredUrl: env.n8n.slack.webhookUrl,
        defaultUrl: env.n8n.webhookUrl
      });
      
      // Fix: always use direct UUID format for Slack webhooks, never fallback to /calendly path
      if (slackWebhookId) {
        // Use the base URL without any path segments (remove /calendly if present)
        const baseUrl = nodeEnv === 'production' 
          ? env.n8n.webhookUrl.replace(/\/calendly$/, '')
          : env.n8n.webhookUrlDev.replace(/\/calendly$/, '');
          
        // Always use UUID pattern for Slack - this is the critical fix
        n8nWebhookUrl = `${baseUrl}/${slackWebhookId}/webhook`;
      } else {
        // Fallback to specific Slack URLs if configured
        n8nWebhookUrl = nodeEnv === 'production'
          ? (env.n8n.slack.webhookUrl || env.n8n.webhookUrl.replace(/\/calendly$/, ''))
          : (env.n8n.slack.webhookUrlDev || env.n8n.webhookUrlDev.replace(/\/calendly$/, ''));
      }
      
      logger.info(`[${trackingId}] N8N FORWARD - USING SLACK WEBHOOK URL`, {
        n8nWebhookUrl,
        webhookId,
        nodeEnv
      });
    } 
    // Use specific URL for calendly
    else if (webhookSource.source === 'calendly') {
      const nodeEnv = process.env.NODE_ENV || 'development';
      n8nWebhookUrl = nodeEnv === 'production' 
        ? env.n8n.calendly.webhookUrl || env.n8n.webhookUrl
        : env.n8n.calendly.webhookUrlDev || env.n8n.webhookUrlDev;
      
      logger.info(`[${trackingId}] N8N FORWARD - USING CALENDLY WEBHOOK URL`, {
        n8nWebhookUrl,
        nodeEnv
      });
    }
    // Fallback to generic URL
    else {
      n8nWebhookUrl = getWebhookUrl('', webhookSource.source);
      logger.info(`[${trackingId}] N8N FORWARD - USING GENERIC WEBHOOK URL`, {
        n8nWebhookUrl,
        source: webhookSource.source
      });
    }
    
    // Determine what payload to send
    let payloadToSend = isSnsFormat ? extractedPayload : data;
    
    // Check specifically for Slack messages from users
    let isSlackUserMessage = false;
    if (webhookSource.source === 'slack') {
      isSlackUserMessage = 
        // Direct check of event data
        (payloadToSend.event?.type === 'message' && !payloadToSend.event?.bot_id && payloadToSend.event?.user) ||
        // Check for our manual flag
        payloadToSend.manual_message === true || 
        payloadToSend._isUserMessage === true;
      
      if (isSlackUserMessage) {
        logger.info(`[${trackingId}] N8N FORWARD - DETECTED MANUAL SLACK MESSAGE`, {
          user: payloadToSend.event?.user,
          channel: payloadToSend.event?.channel,
          text: payloadToSend.event?.text?.substring(0, 100)
        });
      }
      
      // For Slack, improve the payload to help n8n recognize it
      // Add special flags to help n8n detect this correctly
      payloadToSend = {
        ...payloadToSend,
        // Add manual message flag if detected
        manual_message: isSlackUserMessage,
        // Add tracking info
        _trackingId: trackingId,
        _webhookId: webhookId,
        _receivedAt: new Date().toISOString(),
        _isUserMessage: isSlackUserMessage
      };
      
      // Fix for n8n Slack trigger node - ensure channel is properly accessible
      // Ensure event field exists and has channel property
      if (payloadToSend.event && !payloadToSend.event.channel && payloadToSend.event.type === 'message') {
        // Set channel property if we have channel_id in the payload
        if (payloadToSend.channel_id) {
          payloadToSend.event.channel = payloadToSend.channel_id;
        }
        
        // Ensure we have a channel property for the Slack trigger node
        if (!payloadToSend.event.channel && payloadToSend.channel) {
          payloadToSend.event.channel = payloadToSend.channel;
        }
      }
      
      // Add fallback channel if still missing
      if (payloadToSend.event && !payloadToSend.event.channel) {
        payloadToSend.event.channel = 'unknown-channel';
      }
      
      logger.debug(`[${trackingId}] N8N FORWARD - ENHANCED SLACK PAYLOAD`, {
        hasEvent: !!payloadToSend.event,
        eventType: payloadToSend.event?.type,
        isUserMessage: isSlackUserMessage,
        team: payloadToSend.team_id,
        apiAppId: payloadToSend.api_app_id,
        channel: payloadToSend.event?.channel,
        fromSns: isSnsFormat
      });
    }
    
    // Log webhook forwarding
    logger.info(`[${trackingId}] N8N FORWARD - SENDING WEBHOOK TO N8N`, {
      url: n8nWebhookUrl,
      source: webhookSource.source || 'unknown',
      environment: process.env.NODE_ENV || 'development',
      dataSize: JSON.stringify(payloadToSend).length,
      isSlackUserMessage,
      fromSns: isSnsFormat
    });
    
    // Setup headers for forwarding
    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'Altiverr-Webhook-Proxy/1.0',
      'X-Webhook-Source': 'proxy-service',
      'X-Webhook-Type': webhookSource.source || 'unknown',
      'X-Webhook-ID': webhookId,
      'X-Tracking-ID': trackingId,
      'X-SNS-Extracted': isSnsFormat ? 'true' : 'false'
    };
    
    // Add special headers for Slack
    if (webhookSource.source === 'slack') {
      headers['X-Manual-Message'] = isSlackUserMessage ? 'true' : 'false';
      headers['X-Slack-Channel'] = payloadToSend.event?.channel || '';
      headers['X-Slack-Team'] = payloadToSend.team_id || '';
      headers['X-Slack-Event-Type'] = payloadToSend.event?.type || '';
      
      // If we have a Slackbot user agent, keep it
      if (payloadToSend.event?.type === 'message') {
        headers['User-Agent'] = 'Slackbot 1.0 (+https://api.slack.com/robots)';
      }
      
      logger.debug(`[${trackingId}] N8N FORWARD - SLACK HEADERS`, {
        headers: JSON.stringify(headers)
      });
    }
    
    // Log request details
    logger.debug(`[${trackingId}] N8N FORWARD - REQUEST DETAILS`, {
      url: n8nWebhookUrl,
      headers: JSON.stringify(headers),
      payloadSize: JSON.stringify(payloadToSend).length,
      payloadPreview: JSON.stringify(payloadToSend).substring(0, 300)
    });
    
    // Forward to n8n
    const startTime = Date.now();
    
    try {
      const response = await axios.post(n8nWebhookUrl, payloadToSend, {
        headers,
        timeout: env.n8n.timeout
      });
      
      const responseTime = Date.now() - startTime;
      
      // Log successful response
      logger.info(`[${trackingId}] N8N FORWARD - SUCCESS`, {
        statusCode: response.status,
        webhookId,
        source: webhookSource.source || 'unknown',
        responseData: JSON.stringify(response.data),
        responseTime: `${responseTime}ms`,
        isSlackUserMessage,
        fromSns: isSnsFormat
      });
      
      return { 
        success: true, 
        statusCode: response.status, 
        response: response.data,
        webhookId,
        trackingId,
        responseTime
      };
    } catch (error) {
      logger.error(`[${trackingId}] N8N FORWARD - ERROR FORWARDING TO N8N`, {
        error: error.message,
        status: error.response?.status,
        data: error.response?.data ? JSON.stringify(error.response?.data) : null,
        webhookSource: webhookSource.source,
        fromSns: isSnsFormat
      });
      
      throw error;
    }
  } catch (error) {
    logger.error(`[${trackingId}] N8N FORWARD - UNRECOVERABLE ERROR`, {
      error: error.message,
      stack: error.stack
    });
    
    throw error;
  }
}

export default {
  forwardToN8n
}; 