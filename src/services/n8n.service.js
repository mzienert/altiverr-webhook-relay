import axios from 'axios';
import env from '../config/env.js';
import logger from '../utils/logger.js';
import { getWebhookUrl } from '../utils/webhookUrl.js';

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
 * Forward webhook data to n8n
 * @param {Object} data - The webhook data to forward
 * @returns {Promise<Object>} The n8n response
 */
export async function forwardToN8n(data) {
  try {
    if (!data) {
      throw new Error('No data provided for forwarding to n8n');
    }
    
    // Get the appropriate webhook URL based on environment
    const n8nWebhookUrl = getWebhookUrl();
    
    // Enhanced detailed logging to help with debugging
    logger.info('Forwarding webhook payload to n8n', {
      url: n8nWebhookUrl,
      environment: process.env.NODE_ENV || 'development',
      dataType: typeof data,
      dataKeys: Object.keys(data),
      dataSize: JSON.stringify(data).length,
      dataSample: JSON.stringify(data).substring(0, 200) + '...' // Log first 200 chars of data
    });
    
    // Add DETAILED data structure logging
    logger.debug('FULL WEBHOOK DATA STRUCTURE', {
      exactData: JSON.stringify(data, null, 2)
    });
    
    // Print the exact structure for key fields to help debug n8n workflow
    logger.debug('DATA STRUCTURE PATHS', {
      'id': data.id,
      'data.metadata.id': data.data?.metadata?.id,
      'data.metadata.source': data.data?.metadata?.source,
      'data.event.name': data.data?.event?.name,
      'data.event.type': data.data?.event?.type,
      'source': data.source,
      'event': data.event
    });
    
    logger.debug('WEBHOOK FORWARDING - FULL CONFIG', {
      n8nWebhookUrl,
      n8nWebhookUrlFromEnv: env.n8n.webhookUrl,
      n8nWebhookUrlDev: env.n8n.webhookUrlDev,
      nodeEnv: process.env.NODE_ENV,
      isDocker: process.env.DOCKER === 'true'
    });
    
    // Forward the webhook data to n8n using POST
    const response = await axios.post(n8nWebhookUrl, data, {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Altiverr-Webhook-Proxy/1.0',
        'X-Webhook-Source': 'proxy-service'
      },
      timeout: env.n8n.timeout
    });
    
    logger.info('Successfully forwarded webhook to n8n', {
      statusCode: response.status,
      webhookId: data.metadata?.id || data.id || 'unknown',
      responseData: response.data
    });
    
    // Log detailed n8n response
    logger.debug('N8N RESPONSE DETAILS', {
      statusCode: response.status,
      responseData: JSON.stringify(response.data, null, 2),
      responseHeaders: response.headers
    });
    
    return {
      success: true,
      statusCode: response.status,
      response: response.data
    };
  } catch (error) {
    const isNetworkError = error.code === 'ECONNREFUSED' || 
                           error.code === 'ECONNABORTED' || 
                           error.code === 'ETIMEDOUT';
                           
    const statusCode = error.response?.status || (isNetworkError ? 503 : 500);
    const errorMessage = error.response?.data?.message || 
                         error.message || 
                         'Unknown error forwarding to n8n';
    
    logger.error('Failed to forward webhook to n8n', {
      error: errorMessage,
      code: error.code,
      statusCode,
      webhookId: data.metadata?.id || 'unknown',
      isNetworkError,
      n8nWebhookUrl: getWebhookUrl(),
      requestData: JSON.stringify(data).substring(0, 200) + '...' // Log what we tried to send
    });
    
    // If there's a network error, log more details about the network configuration
    if (isNetworkError) {
      logger.error('Network error details', {
        error: errorMessage,
        code: error.code,
        n8nUrl: getWebhookUrl(),
        originalN8nUrl: env.n8n.webhookUrl,
        host: env.server?.host || 'localhost',
        port: env.server?.port || env.api.port
      });
    }
    
    return {
      success: false,
      statusCode,
      error: errorMessage,
      isNetworkError
    };
  }
}

export default {
  forwardToN8n,
  extractSlackFromSNS
}; 