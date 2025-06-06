#!/usr/bin/env node

/**
 * Direct Slack Message Changed Webhook Test Utility
 * 
 * This script sends a simulated Slack webhook message_changed event directly to the local webhook service.
 * Useful for testing n8n workflows that use the Slack trigger node to detect message edits.
 * 
 * Usage:
 * node direct-slack-messagechanged.js [custom text]
 * 
 * Optional: Provide custom text for the changed message
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
  
  // Message timestamps
  originalTs: `${Math.floor(Date.now() / 1000) - 10}.${Date.now() % 1000}`, // Original message (10 seconds ago)
  ts: `${Math.floor(Date.now() / 1000)}.${Date.now() % 1000}`, // Current event timestamp
  
  // Generic IDs
  botUserId: 'U08QPJ1GLS0', // Bot user ID (can be your app's bot ID)
  botId: 'B08QPJ1G344',    // Bot ID
  apiAppId: 'A08QT8LEPEV',
  
  // Default message texts
  originalText: 'This is the original message before editing',
  defaultChangedText: 'This is the edited message text (message_changed event)'
};

/**
 * Create a realistic Slack message_changed payload
 */
function createMessageChangedPayload(newText) {
  const changedText = newText || config.defaultChangedText;
  const clientMsgId = randomUUID(); 
  const eventId = `Ev${randomUUID().substring(0, 8).toUpperCase()}`;
  
  // Common block elements for both messages
  const createTextBlocks = (text) => [
    {
      type: "rich_text",
      block_id: `RT${randomUUID().substring(0, 4)}`,
      elements: [
        {
          type: "rich_text_section",
          elements: [
            {
              type: "text",
              text: text
            }
          ]
        }
      ]
    }
  ];
  
  // Create the previous (original) message object
  const previousMessage = {
    user: config.userId,
    type: "message",
    ts: config.originalTs,
    client_msg_id: clientMsgId,
    text: config.originalText,
    team: config.teamId,
    blocks: createTextBlocks(config.originalText),
    bot_profile: {
      id: config.botId,
      app_id: config.apiAppId,
      user_id: config.botUserId,
      name: "Altiverr Automations",
      icons: {
        image_36: "https://a.slack-edge.com/80588/img/plugins/app/bot_36.png",
        image_48: "https://a.slack-edge.com/80588/img/plugins/app/bot_48.png",
        image_72: "https://a.slack-edge.com/80588/img/plugins/app/service_72.png"
      },
      deleted: false,
      updated: 1746142687,
      team_id: config.teamId
    }
  };
  
  // Create the new (changed) message object
  const changedMessage = {
    user: config.userId,
    type: "message",
    bot_id: config.botId,
    app_id: config.apiAppId,
    text: changedText,
    team: config.teamId,
    bot_profile: {
      id: config.botId,
      deleted: false,
      name: "Altiverr Automations",
      updated: 1746142687,
      app_id: config.apiAppId,
      user_id: config.botUserId,
      icons: {
        image_36: "https://a.slack-edge.com/80588/img/plugins/app/bot_36.png",
        image_48: "https://a.slack-edge.com/80588/img/plugins/app/bot_48.png",
        image_72: "https://a.slack-edge.com/80588/img/plugins/app/service_72.png"
      },
      team_id: config.teamId
    },
    blocks: createTextBlocks(changedText),
    ts: config.originalTs // Keep the same timestamp for the message itself
  };
  
  // Create the full message_changed event payload
  return {
    token: "7y4r2sNc6GAINd7VtO4IwE5V",
    team_id: config.teamId,
    context_team_id: config.teamId,
    context_enterprise_id: null,
    api_app_id: config.apiAppId,
    event: {
      type: "message",
      subtype: "message_changed",
      message: changedMessage,
      previous_message: previousMessage,
      channel: config.channelId,
      hidden: true,
      ts: config.ts, // This is the event timestamp
      event_ts: config.ts,
      channel_type: "channel"
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
    console.log(`Sending direct Slack message_changed webhook to ${config.webhookUrl}...`);
    console.log(`Original Message: "${config.originalText}"`);
    console.log(`Changed Message: "${payload.event.message.text}"`);
    console.log(`Channel: ${payload.event.channel}`);
    console.log(`Original Timestamp: ${config.originalTs}`);
    console.log(`Event Timestamp: ${payload.event.ts}`);
    
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
const payload = createMessageChangedPayload(customText);
sendWebhook(payload); 