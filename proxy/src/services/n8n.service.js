import axios from 'axios';
import env from '../../config/env.js';
import logger from '../utils/logger.js';
import { getWebhookUrl } from '../utils/webhookUrl.js';
import { detectWebhookSource, detectWebhookFromPayload } from '../../../shared/utils/webhookDetector.js';

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
    
    // Use centralized webhook detection if source not provided
    let webhookSource = source ? { source } : detectWebhookSource(data);
    
    if (typeof webhookSource === 'string') {
      webhookSource = { source: webhookSource };
    }
    
    logger.info(`[${trackingId}] N8N FORWARD - DETECTION RESULT`, {
      providedSource: source,
      detectedSource: webhookSource.source,
      confidence: webhookSource.confidence || 'legacy',
      isSNS: webhookSource.isSNS
    });
    
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
        fromSns: webhookSource.isSNS
      });
    }
    
    logger.info(`[${trackingId}] N8N FORWARD - PAYLOAD PREPARED`, {
      url: n8nWebhookUrl,
      id: webhookId,
      source: webhookSource.source,
      dataSize: JSON.stringify(payloadToSend).length,
      isSlackUserMessage,
      fromSns: webhookSource.isSNS
    });
    
    // Prepare headers for forwarding
    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'Altiverr-Webhook-Relay',
      'X-Webhook-Source': 'proxy-service',
      'X-Webhook-Type': webhookSource.source,
      'X-Webhook-ID': webhookId,
      'X-Tracking-ID': trackingId,
      'X-SNS-Extracted': webhookSource.isSNS ? 'true' : 'false',
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
      fromSns: webhookSource.isSNS
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
      responseTime: `${responseTime}ms`
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