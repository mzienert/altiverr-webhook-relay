#!/usr/bin/env node

/**
 * SNS-Wrapped Slack Webhook Test Utility
 * 
 * This script sends a simulated SNS message containing a Slack webhook payload to the local webhook service.
 * Useful for testing n8n workflows that use the Slack trigger node in test mode.
 * 
 * Usage:
 * node sns-slack-webhook.js [custom text]
 * 
 * Optional: Provide custom text for the message
 */

import axios from 'axios';
import { randomUUID } from 'crypto';

// Configuration - adjust as needed
const config = {
  // Your local webhook service URL
  webhookUrl: 'http://localhost:3333/api/webhook/slack',
  
  // SNS information
  topicArn: 'arn:aws:sns:us-west-1:619326977873:Webhooks',
  
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
  defaultText: 'This is a test message from the SNS-wrapped Slack webhook test script'
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
 * Create an SNS-wrapped message containing the Slack payload
 */
function createSnsWrappedMessage(slackPayload) {
  const metadataId = randomUUID();
  const messageId = `sns-${randomUUID()}`;
  
  // Create the inner message structure that wraps the Slack payload
  const innerMessage = {
    data: {
      metadata: {
        source: "slack",
        id: metadataId
      },
      team_id: config.teamId,
      channel: config.channelId,
      payload: {
        original: slackPayload,
        eventType: "message"
      }
    }
  };
  
  // Create the outer SNS message structure
  return {
    Type: "Notification",
    MessageId: messageId,
    TopicArn: config.topicArn,
    Message: JSON.stringify(innerMessage),
    Timestamp: new Date().toISOString(),
    SignatureVersion: "1",
    Signature: "SIMULATED_SIGNATURE",
    SigningCertURL: "https://sns.us-west-1.amazonaws.com/SimpleNotificationService-SIMULATED.pem",
    UnsubscribeURL: `https://sns.us-west-1.amazonaws.com/?Action=Unsubscribe&SubscriptionArn=${config.topicArn}:${messageId}`
  };
}

/**
 * Send the SNS-wrapped Slack webhook to the local service
 */
async function sendSnsWebhook(slackPayload) {
  try {
    const snsPayload = createSnsWrappedMessage(slackPayload);
    
    console.log(`Sending SNS-wrapped Slack webhook to ${config.webhookUrl}...`);
    console.log(`Message: "${slackPayload.event.text}"`);
    console.log(`Channel: ${slackPayload.event.channel}`);
    console.log(`Timestamp: ${slackPayload.event.ts}`);
    console.log(`SNS MessageId: ${snsPayload.MessageId}`);
    
    const response = await axios.post(config.webhookUrl, snsPayload, {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Amazon Simple Notification Service Agent',
        'x-amz-sns-message-type': 'Notification',
        'x-amz-sns-message-id': snsPayload.MessageId,
        'x-amz-sns-topic-arn': snsPayload.TopicArn
      }
    });
    
    console.log('Response:', response.status, response.statusText);
    console.log('Response data:', JSON.stringify(response.data, null, 2));
    console.log('\nSNS webhook sent successfully! Check your n8n workflow.');
  } catch (error) {
    console.error('Error sending SNS webhook:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }
}

// Main execution
const customText = process.argv[2];
const slackPayload = createSlackPayload(customText);
sendSnsWebhook(slackPayload);