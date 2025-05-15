#!/usr/bin/env node

/**
 * Direct Slack Webhook Test Utility
 * 
 * This script sends a simulated Slack webhook message directly to the local webhook service.
 * Useful for testing n8n workflows that use the Slack trigger node in test mode.
 * 
 * Usage:
 * node direct-slack-webhook.js [custom text]
 * 
 * Optional: Provide custom text for the message
 */

import axios from 'axios';
import { randomUUID } from 'crypto';

// Configuration - adjust as needed
const config = {
  // Your local webhook service URL
  webhookUrl: 'http://localhost:3333/webhook/slack',
  
  // Slack team and channel info (from your actual Slack workspace)
  teamId: 'T08ME847DE0',
  channelId: 'C08Q6C6J4BZ',
  userId: 'U08ME847MV2',
  
  // Message timestamp (use current time with Slack's format)
  ts: `${Math.floor(Date.now() / 1000)}.${Date.now() % 1000}`,
  
  // Generic IDs
  botUserId: 'U08QPJ1GLFW',
  apiAppId: 'A08QT8LEPEV',
  
  // Default message text
  defaultText: 'This is a test message from the direct Slack webhook test script'
};

/**
 * Create a realistic Slack message payload
 */
function createSlackPayload(text) {
  const messageText = text || config.defaultText;
  const clientMsgId = randomUUID(); 
  const eventId = `Ev${randomUUID().substring(0, 8).toUpperCase()}`;
  
  return {
    token: "REDACTED_TOKEN",
    team_id: config.teamId,
    context_team_id: config.teamId,
    context_enterprise_id: null,
    api_app_id: config.apiAppId,
    event: {
      user: config.userId,
      type: "message",
      ts: config.ts,
      client_msg_id: clientMsgId,
      text: messageText,
      team: config.teamId,
      blocks: [
        {
          type: "rich_text",
          block_id: `RT${clientMsgId.substring(0, 4)}`,
          elements: [
            {
              type: "rich_text_section",
              elements: [
                {
                  type: "text",
                  text: messageText
                }
              ]
            }
          ]
        }
      ],
      channel: config.channelId,
      event_ts: config.ts
    },
    type: "event_callback",
    event_id: eventId,
    event_time: Math.floor(Date.now() / 1000),
    authorizations: [
      {
        enterprise_id: null,
        team_id: config.teamId,
        user_id: config.botUserId,
        is_bot: true,
        is_enterprise_install: false
      }
    ],
    is_ext_shared_channel: false,
    event_context: `4-${Buffer.from(JSON.stringify({
      et: "message", 
      tid: config.teamId, 
      aid: config.apiAppId, 
      cid: config.channelId
    })).toString('base64')}`
  };
}

/**
 * Send the Slack webhook to the local service
 */
async function sendWebhook(payload) {
  try {
    console.log(`Sending direct Slack webhook to ${config.webhookUrl}...`);
    console.log(`Message: "${payload.event.text}"`);
    console.log(`Channel: ${payload.event.channel}`);
    console.log(`Timestamp: ${payload.event.ts}`);
    
    const response = await axios.post(config.webhookUrl, payload, {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Slackbot 1.0 (+https://api.slack.com/robots)'
      }
    });
    
    console.log('Response:', response.status, response.statusText);
    console.log('Response data:', JSON.stringify(response.data, null, 2));
    console.log('\nWebhook sent successfully! Check your n8n workflow.');
  } catch (error) {
    console.error('Error sending webhook:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }
}

// Main execution
const customText = process.argv[2];
const payload = createSlackPayload(customText);
sendWebhook(payload);