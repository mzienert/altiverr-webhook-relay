import axios from 'axios';
import env from '../../config/env.js';
import logger from '../utils/logger.js';
import os from 'os';
import { getWebhookUrl } from '../utils/webhookUrl.js';

/**
 * Send a notification to Slack (if configured)
 * @param {string} message - The message to send
 * @param {Object} [options] - Additional options
 * @param {boolean} [options.isError=false] - Whether this is an error notification
 * @param {Object} [options.data] - Additional data to include
 */
export async function sendNotification(message, options = {}) {
  const { isError = false, data = {} } = options;
  
  // Skip if notifications are disabled or Slack webhook URL is not configured
  if (!env.notifications.slackWebhookUrl) {
    return;
  }
  
  // Skip if this is a start notification and notifyOnStart is disabled
  if (!isError && !env.notifications.notifyOnStart) {
    return;
  }
  
  // Skip if this is an error notification and notifyOnError is disabled
  if (isError && !env.notifications.notifyOnError) {
    return;
  }
  
  try {
    const hostname = os.hostname();
    const publicUrl = env.server.publicUrl;
    
    // Prepare the Slack message
    const slackMessage = {
      text: isError ? `:warning: *Error: ${message}*` : `:white_check_mark: ${message}`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: isError ? `:warning: *Error: ${message}*` : `:white_check_mark: ${message}`
          }
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: `*Host:*\n${hostname}`
            },
            {
              type: 'mrkdwn',
              text: `*URL:*\n${publicUrl}`
            },
            {
              type: 'mrkdwn',
              text: `*Environment:*\n${env.server.env}`
            },
            {
              type: 'mrkdwn',
              text: `*Time:*\n${new Date().toISOString()}`
            }
          ]
        }
      ]
    };
    
    // Add data as a JSON block if provided
    if (Object.keys(data).length > 0) {
      slackMessage.blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Details:*\n\`\`\`${JSON.stringify(data, null, 2)}\`\`\``
        }
      });
    }
    
    // Send to Slack
    await axios.post(env.notifications.slackWebhookUrl, slackMessage);
    
    logger.debug('Sent notification to Slack', { message });
  } catch (error) {
    logger.error('Failed to send notification', { 
      error: error.message,
      message 
    });
  }
}

/**
 * Send a startup notification
 */
export function sendStartupNotification() {
  const n8nWebhookUrl = getWebhookUrl();
  
  // Get the Slack webhook URL for notification
  const nodeEnv = process.env.NODE_ENV || 'development';
  const slackWebhookId = env.n8n.slack.webhookId;
  const slackWebhookUrl = nodeEnv === 'production'
    ? `http://localhost:5678/webhook/${slackWebhookId}/webhook`
    : `http://localhost:5678/webhook-test/${slackWebhookId}/webhook`;
  
  sendNotification('Webhook Proxy Service Started', {
    data: {
      port: env.server.port,
      publicUrl: env.server.publicUrl,
      n8nWebhookUrl: n8nWebhookUrl,
      slackWebhookUrl: slackWebhookUrl,
      environment: process.env.NODE_ENV || 'development'
    }
  });
}

/**
 * Send an error notification
 * @param {string} message - The error message
 * @param {Object} data - Additional error details
 */
export function sendErrorNotification(message, data = {}) {
  sendNotification(message, {
    isError: true,
    data
  });
}

export default {
  sendNotification,
  sendStartupNotification,
  sendErrorNotification
}; 