import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// ES module fix for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env file
// Both services can use this, with different .env file locations
const loadEnvFile = (envPath) => {
  try {
    dotenv.config({ path: envPath });
  } catch (error) {
    // Silently fail if .env file doesn't exist
  }
};

// Try to load .env from multiple possible locations
loadEnvFile(path.join(__dirname, '../../.env')); // Root level
loadEnvFile(path.join(__dirname, '../../../.env')); // One level up from shared

/**
 * Unified configuration for both API and Proxy services
 * Each service can import this and use only what it needs
 */
const env = {
  // ============================================================================
  // SHARED CONFIGURATION - Used by both services
  // ============================================================================
  
  aws: {
    region: process.env.AWS_REGION || 'us-west-1',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    snsTopicArn: process.env.SNS_TOPIC_ARN
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
  
  // Common environment settings
  common: {
    nodeEnv: process.env.NODE_ENV || 'development',
    logLevel: process.env.LOG_LEVEL || 'info',
    isProduction: process.env.NODE_ENV === 'production',
    isDevelopment: process.env.NODE_ENV !== 'production'
  },
  
  // ============================================================================
  // API SERVICE SPECIFIC CONFIGURATION
  // ============================================================================
  
  api: {
    port: parseInt(process.env.API_PORT || process.env.PORT || '8080', 10),
    host: process.env.API_HOST || process.env.SERVER_HOST || 'localhost',
    env: process.env.NODE_ENV || 'development',
    logLevel: process.env.LOG_LEVEL || 'info'
  },
  
  security: {
    webhookSecret: process.env.WEBHOOK_SECRET
  },
  
  calendly: {
    webhookSecret: process.env.CALENDLY_WEBHOOK_SECRET
  },
  
  slack: {
    signingSecret: process.env.SLACK_SIGNING_SECRET,
    appId: process.env.SLACK_APP_ID,
    clientId: process.env.SLACK_CLIENT_ID,
    clientSecret: process.env.SLACK_CLIENT_SECRET
  },
  
  // ============================================================================
  // PROXY SERVICE SPECIFIC CONFIGURATION
  // ============================================================================
  
  proxy: {
    // WARNING: The proxy MUST run on port 3333 to match the Cloudflare tunnel configuration
    // DO NOT CHANGE THIS PORT unless you also update the Cloudflare tunnel configuration
    port: parseInt(process.env.PROXY_PORT || process.env.PORT || '3333', 10),
    host: process.env.PROXY_HOST || process.env.HOST || '0.0.0.0',
    env: process.env.NODE_ENV || 'development',
    logLevel: process.env.LOG_LEVEL || 'info',
    publicUrl: process.env.PUBLIC_URL || 'http://localhost:3333'
  },
  
  notifications: {
    slackWebhookUrl: process.env.SLACK_WEBHOOK_URL,
    notifyOnStart: process.env.NOTIFY_ON_START === 'true',
    notifyOnError: process.env.NOTIFY_ON_ERROR === 'true'
  },
  
  // ============================================================================
  // LEGACY COMPATIBILITY - For backward compatibility
  // ============================================================================
  
  server: {
    host: process.env.SERVER_HOST || 'localhost',
    port: process.env.SERVER_PORT || process.env.PORT || 8080
  }
};

// ============================================================================
// SERVICE-SPECIFIC HELPERS
// ============================================================================

/**
 * Get configuration for API service
 * @returns {Object} API service specific configuration
 */
export function getApiConfig() {
  return {
    aws: env.aws,
    api: env.api,
    security: env.security,
    calendly: env.calendly,
    slack: env.slack,
    n8n: env.n8n,
    server: env.server,
    common: env.common
  };
}

/**
 * Get configuration for Proxy service
 * @returns {Object} Proxy service specific configuration
 */
export function getProxyConfig() {
  return {
    aws: env.aws,
    server: env.proxy, // Map proxy config to server for compatibility
    n8n: env.n8n,
    notifications: env.notifications,
    common: env.common
  };
}

/**
 * Debug environment configuration (only in development)
 */
export function debugConfig(serviceName = 'unknown') {
  if (env.common.isProduction) return;
  
  console.log(`[${serviceName}] Environment configuration loaded:`, {
    nodeEnv: env.common.nodeEnv,
    region: env.aws.region,
    logLevel: env.common.logLevel,
    topicArn: env.aws.snsTopicArn ? '✓' : '✗',
    accessKeyId: env.aws.accessKeyId ? '✓' : '✗',
    secretAccessKey: env.aws.secretAccessKey ? '✓' : '✗',
    slackSigningSecret: env.slack.signingSecret ? '✓' : '✗',
    n8nWebhookUrl: env.n8n.webhookUrl,
    serviceName
  });
}

export default env; 