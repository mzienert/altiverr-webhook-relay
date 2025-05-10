import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// ES module fix for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env file only in development
// Vercel automatically provides environment variables in production
if (process.env.NODE_ENV !== 'production') {
  dotenv.config({ path: path.join(__dirname, '../../.env') });
}

const env = {
  aws: {
    region: process.env.AWS_REGION || 'us-west-1',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    snsTopicArn: process.env.SNS_TOPIC_ARN
  },
  api: {
    port: process.env.PORT || 8080,
    env: process.env.NODE_ENV || 'development',
    logLevel: process.env.LOG_LEVEL || 'info'
  },
  security: {
    webhookSecret: process.env.WEBHOOK_SECRET
  },
  calendly: {
    webhookSecret: process.env.CALENDLY_WEBHOOK_SECRET
  }
};

// Debug environment (only in development)
if (process.env.NODE_ENV !== 'production') {
  console.log('Environment configuration loaded:', {
    region: env.aws.region,
    port: env.api.port,
    env: env.api.env,
    logLevel: env.api.logLevel,
    topicArn: env.aws.snsTopicArn ? '✓' : '✗',
    accessKeyId: env.aws.accessKeyId ? '✓' : '✗',
    secretAccessKey: env.aws.secretAccessKey ? '✓' : '✗',
  });
}

export default env; 