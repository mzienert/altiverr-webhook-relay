import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// ES module fix for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

const env = {
  aws: {
    region: process.env.AWS_REGION || 'us-west-1',
    snsTopicArn: process.env.SNS_TOPIC_ARN
  },
  server: {
    // WARNING: The proxy MUST run on port 3333 to match the Cloudflare tunnel configuration
    // DO NOT CHANGE THIS PORT unless you also update the Cloudflare tunnel configuration
    port: parseInt(process.env.PORT || '3333', 10),
    host: process.env.HOST || '0.0.0.0',
    env: process.env.NODE_ENV || 'development',
    logLevel: process.env.LOG_LEVEL || 'info',
    publicUrl: process.env.PUBLIC_URL || 'http://localhost:3333'
  },
  n8n: {
    // Default webhook URLs (used if no source-specific URLs are provided)
    webhookUrl: process.env.N8N_WEBHOOK_URL || 'http://localhost:5678/webhook',
    webhookUrlDev: process.env.N8N_WEBHOOK_URL_DEV || 'http://localhost:5678/webhook-test',
    
    // Source-specific webhook URLs
    calendly: {
      webhookUrl: process.env.N8N_CALENDLY_WEBHOOK_URL || process.env.N8N_WEBHOOK_URL || 'http://localhost:5678/webhook/calendly',
      webhookUrlDev: process.env.N8N_CALENDLY_WEBHOOK_URL_DEV || process.env.N8N_WEBHOOK_URL_DEV || 'http://localhost:5678/webhook-test/calendly'
    },
    slack: {
      // Use specific webhook ID for Slack
      webhookId: process.env.N8N_SLACK_WEBHOOK_ID || '09210404-b3f7-48c7-9cd2-07f922bc4b14',
      // FIXED: Point directly to n8n instead of the proxy service
      webhookUrl: process.env.N8N_SLACK_WEBHOOK_URL || `http://localhost:5678/webhook/${process.env.N8N_SLACK_WEBHOOK_ID || '09210404-b3f7-48c7-9cd2-07f922bc4b14'}/webhook`,
      webhookUrlDev: process.env.N8N_SLACK_WEBHOOK_URL_DEV || `http://localhost:5678/webhook-test/${process.env.N8N_SLACK_WEBHOOK_ID || '09210404-b3f7-48c7-9cd2-07f922bc4b14'}/webhook`,
      // Add additional standard webhook URLs as fallbacks
      webhookUrlFallbacks: [
        'http://localhost:5678/webhook/slack',
        'http://localhost:5678/webhook'
      ]
    },
    
    webhookEndpoint: process.env.N8N_WEBHOOK_ENDPOINT || 'webhook',
    webhookPath: process.env.N8N_WEBHOOK_PATH || '/',
    timeout: parseInt(process.env.N8N_TIMEOUT || '10000', 10) // 10 seconds default
  },
  notifications: {
    slackWebhookUrl: process.env.SLACK_WEBHOOK_URL,
    notifyOnStart: process.env.NOTIFY_ON_START === 'true',
    notifyOnError: process.env.NOTIFY_ON_ERROR === 'true'
  }
};

export default env; 