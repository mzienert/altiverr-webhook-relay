import axios from 'axios';
import env from '../../config/env.js';
import logger from '../utils/logger.js';
import { getWebhookUrl } from '../utils/webhookUrl.js';

/**
 * Generates a consistent ID from a Slack webhook payload
 * @param {Object} data - Webhook payload
 * @returns {string} A consistent ID for logging
 */
function generateConsistentWebhookId(data) {
  // For Slack message events, use team_id + channel + ts for consistent IDs
  if (data.event?.type === 'message') {
    // For message_changed events, use the original message timestamp to avoid duplicates
    if (data.event?.subtype === 'message_changed') {
      const originalTs = data.event?.message?.ts || 
                         data.event?.previous_message?.ts || 
                         data.event?.ts;
      
      return `slack_msg_${data.team_id || 'team'}_${data.event.channel || 'channel'}_${originalTs}`;
    }
    
    return `slack_msg_${data.team_id || 'team'}_${data.event.channel || 'channel'}_${data.event.ts}`;
  }
  
  // For Slack events with event_id, use that
  if (data.event_id) {
    return `slack_${data.event_id}`;
  }
  
  // For Calendly events, extract the UUID from the URI
  if (data.event && (data.event === 'invitee.created' || data.event === 'invitee.canceled')) {
    const uri = data.payload?.uri || data.payload?.invitee?.uri;
    if (uri) {
      return `calendly_${uri.split('/').pop()}`;
    }
  }
  
  // For SNS messages with Calendly data
  if (data.Message && typeof data.Message === 'string' && data.Message.includes('calendly')) {
    try {
      const parsedMessage = JSON.parse(data.Message);
      if (parsedMessage.data?.metadata?.source === 'calendly') {
        const uri = parsedMessage.data?.payload?.original?.payload?.uri || 
                   parsedMessage.data?.payload?.original?.payload?.invitee?.uri;
        
        if (uri) {
          return `calendly_${uri.split('/').pop()}`;
        }
        
        return `calendly_${parsedMessage.data?.metadata?.id || Date.now()}`;
      }
    } catch (e) {
      // Failed to parse, continue with other ID methods
    }
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
function extractSlackFromSNS(data) {
  if (!data || !data.Message || typeof data.Message !== 'string') {
    logger.error('Failed to extract Slack from SNS: Invalid or missing Message field');
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
      logger.error('Failed to extract Slack from SNS: Invalid structure', {
        source: parsedMessage.data?.metadata?.source,
        hasOriginal: !!parsedMessage.data?.payload?.original,
        payloadKeys: parsedMessage.data?.payload ? Object.keys(parsedMessage.data.payload) : []
      });
      return null;
    }
    
    // Extract the Slack payload
    const slackPayload = parsedMessage.data.payload.original;
    
    // Log the extracted payload structure 
    logger.debug('Extracted Slack payload from SNS:', {
      hasEvent: !!slackPayload.event,
      eventType: slackPayload.event?.type,
      hasChannel: !!slackPayload.event?.channel,
      hasTeamId: !!slackPayload.team_id
    });
    
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
 * Forwards data to n8n webhook
 * @param {Object} options - Options for forwarding
 * @param {Object} options.data - Data to forward
 * @param {string} options.id - Optional ID for tracking
 * @param {string} options.source - Source of the webhook (slack, calendly, etc.)
 * @returns {Promise<Object>} - Result of forwarding
 */
async function forwardToN8n({ data, id, source }) {
  const trackingId = `fwd_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const startTime = Date.now();
  
  try {
    // Generate a webhook ID if not provided
    const webhookId = id || generateConsistentWebhookId(data);
    
    logger.info(`[${trackingId}] N8N FORWARD - STARTING`, {
      id: webhookId,
      source: source || 'unknown',
      dataType: typeof data,
      dataPreview: JSON.stringify(data).substring(0, 300)
    });
    
    // Detect webhook source if not provided and not already determined from SNS
    let webhookSource = source ? { source } : detectWebhookSource(data);
    
    if (typeof webhookSource === 'string') {
      webhookSource = { source: webhookSource };
    }
    
    // Determine n8n webhook URL based on source
    let n8nWebhookUrl = '';
    
    if (webhookSource.source === 'slack') {
      n8nWebhookUrl = env.n8n.slack.webhookUrl || env.n8n.webhookUrl;
    } else if (webhookSource.source === 'calendly') {
      n8nWebhookUrl = env.n8n.calendly.webhookUrl || env.n8n.webhookUrl;
    } else {
      // Default to the general webhook URL
      n8nWebhookUrl = env.n8n.webhookUrl;
    }
    
    // If we still don't have a URL, use the auto-detected one
    if (!n8nWebhookUrl) {
      n8nWebhookUrl = getWebhookUrl();
    }
    
    // Add the tracking ID and webhook ID as query params
    if (n8nWebhookUrl.includes('?')) {
      n8nWebhookUrl = `${n8nWebhookUrl}&tid=${trackingId}&wid=${webhookId}`;
    } else {
      n8nWebhookUrl = `${n8nWebhookUrl}?tid=${trackingId}&wid=${webhookId}`;
    }
    
    // Determine what payload to send
    let payloadToSend = data;
    
    // Check specifically for Slack messages from users
    const isSlackUserMessage = 
      webhookSource.source === 'slack' &&
      payloadToSend.event?.type === 'message' &&
      !payloadToSend.event?.bot_id &&
      payloadToSend.event?.user;
      
    if (isSlackUserMessage) {
      logger.info(`[${trackingId}] N8N FORWARD - DETECTED SLACK USER MESSAGE`, {
        user: payloadToSend.event.user,
        channel: payloadToSend.event.channel,
        team: payloadToSend.team_id,
        text: payloadToSend.event.text?.substring(0, 100),
        ts: payloadToSend.event.ts,
        type: payloadToSend.event.type,
        apiAppId: payloadToSend.api_app_id,
        channel: payloadToSend.event?.channel,
        fromSns: false
      });
    }
    
    logger.info(`[${trackingId}] N8N FORWARD - PAYLOAD PREPARED`, {
      url: n8nWebhookUrl,
      id: webhookId,
      source: webhookSource.source,
      dataSize: JSON.stringify(payloadToSend).length,
      isSlackUserMessage,
      fromSns: false
    });
    
    // Prepare headers for forwarding
    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'Altiverr-Webhook-Relay',
      'X-Webhook-Source': 'proxy-service',
      'X-Webhook-Type': webhookSource.source,
      'X-Webhook-ID': webhookId,
      'X-Tracking-ID': trackingId,
      'X-SNS-Extracted': 'false',
      'X-Deduplication-ID': webhookId
    };
    
    // Forward to n8n
    const response = await axios.post(n8nWebhookUrl, payloadToSend, { headers });
    
    const responseTime = Date.now() - startTime;
    
    // Log successful forward
    logger.info(`[${trackingId}] N8N FORWARD - SUCCESS`, {
      statusCode: response.status,
      responseData: response.data,
      id: webhookId,
      source: webhookSource.source,
      url: n8nWebhookUrl,
      responseTime: `${responseTime}ms`,
      isSlackUserMessage,
      fromSns: false
    });
    
    return {
      success: true,
      statusCode: response.status,
      message: 'Successfully forwarded to n8n',
      data: response.data,
      id: webhookId,
      responseTime
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    
    // Log error
    logger.error(`[${trackingId}] N8N FORWARD - FAILED`, {
      error: error.message,
      stack: error.stack,
      id: id || 'unknown',
      source: source || 'unknown',
      statusCode: error.response?.status,
      data: error.response?.data ? JSON.stringify(error.response?.data) : null,
      webhookSource: source || 'unknown',
      fromSns: false
    });
    
    return {
      success: false,
      statusCode: error.response?.status || 500,
      message: `Failed to forward to n8n: ${error.message}`,
      error: error.message,
      id: id || 'unknown',
      responseTime
    };
  }
}

export {
  forwardToN8n,
  extractSlackFromSNS
}; 