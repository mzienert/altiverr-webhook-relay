import AWS from 'aws-sdk';
import env from './env.js';
import logger from '../utils/logger.js';

// Configure AWS SDK
AWS.config.update({
  region: env.aws.region,
  accessKeyId: env.aws.accessKeyId,
  secretAccessKey: env.aws.secretAccessKey
});

// Create SNS instance
const sns = new AWS.SNS();

// Validate SNS configuration (minimal check)
async function validateSnsConfig() {
  try {
    if (!env.aws.snsTopicArn) {
      throw new Error('SNS Topic ARN is not configured');
    }
    
    // Skip the getTopicAttributes check since our user might only have publish permissions
    // Instead just log information about the configuration
    logger.info(`SNS configuration initialized with topic: ${env.aws.snsTopicArn}`);
    logger.info('Using AWS region: ' + env.aws.region);
    
    return true;
  } catch (error) {
    logger.error('SNS configuration validation failed', { 
      error: error.message,
      stack: env.api.env === 'development' ? error.stack : undefined
    });
    return false;
  }
}

export { sns, validateSnsConfig }; 