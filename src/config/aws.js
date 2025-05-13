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
    // Log environment variables status without revealing sensitive info
    logger.info('AWS Configuration Status:', {
      region: env.aws.region || 'NOT SET',
      accessKeyId: env.aws.accessKeyId ? '✓ (Set)' : '✗ (Not Set)',
      secretAccessKey: env.aws.secretAccessKey ? '✓ (Set)' : '✗ (Not Set)',
      snsTopicArn: env.aws.snsTopicArn || 'NOT SET'
    });
    
    if (!env.aws.snsTopicArn) {
      logger.error('SNS Topic ARN is not configured. Ensure SNS_TOPIC_ARN is set in your environment variables.');
      throw new Error('SNS Topic ARN is not configured');
    }
    
    // Skip the getTopicAttributes check since our user might only have publish permissions
    // Instead just log information about the configuration
    logger.info(`SNS configuration initialized with topic: ${env.aws.snsTopicArn}`);
    logger.info('Using AWS region: ' + env.aws.region);
    
    // Try to check if we can list topics as a basic validation
    try {
      const result = await sns.listTopics().promise();
      const topicExists = result.Topics.some(topic => topic.TopicArn === env.aws.snsTopicArn);
      
      logger.info('SNS topic check:', {
        topicsFound: result.Topics.length,
        targetTopicFound: topicExists ? 'Yes' : 'No',
        topicArn: env.aws.snsTopicArn
      });
      
      if (!topicExists) {
        logger.warn('The configured SNS topic ARN was not found in the list of available topics.');
      }
    } catch (listError) {
      // This might fail due to permissions, which is okay
      logger.warn('Unable to verify SNS topic exists (may be due to permissions):', {
        error: listError.message
      });
    }
    
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