import { sns } from '../config/aws.js';
import env from '../config/env.js';
import logger from '../utils/logger.js';

/**
 * Publish a message to the SNS topic
 * @param {Object} data - The data to publish
 * @param {string} messageId - Unique message ID for idempotency
 * @returns {Promise<Object>} The SNS publish response
 */
export async function publishToSns(data, messageId) {
  try {
    if (!data) {
      throw new Error('Data is required for SNS publishing');
    }
    
    if (!messageId) {
      throw new Error('Message ID is required for idempotency');
    }
    
    // Log SNS configuration details
    logger.info('SNS Configuration Check', {
      topicArn: env.aws.snsTopicArn || 'NOT SET',
      region: env.aws.region || 'NOT SET',
      hasAccessKey: env.aws.accessKeyId ? 'YES' : 'NO',
      hasSecretKey: env.aws.secretAccessKey ? 'YES' : 'NO',
      messageId
    });
    
    if (!env.aws.snsTopicArn) {
      throw new Error('SNS Topic ARN is not configured');
    }
    
    // Prepare the message with metadata
    const message = {
      id: messageId,
      data,
      timestamp: new Date().toISOString()
    };
    
    const params = {
      Message: JSON.stringify(message),
      TopicArn: env.aws.snsTopicArn,
      MessageAttributes: {
        'id': {
          DataType: 'String',
          StringValue: messageId
        }
      }
    };
    
    logger.debug('Attempting to publish message to SNS', {
      messageId,
      topicArn: params.TopicArn,
      dataSize: JSON.stringify(data).length
    });
    
    const result = await sns.publish(params).promise();
    
    logger.info('Message published to SNS successfully', { 
      messageId: result.MessageId,
      requestId: messageId,
      snsTopicArn: env.aws.snsTopicArn.split(':').pop() // Just log the topic name for privacy
    });
    
    return {
      success: true,
      messageId: result.MessageId,
      requestId: messageId
    };
  } catch (error) {
    logger.error('Failed to publish message to SNS', {
      error: error.message,
      stack: env.api.env === 'development' ? error.stack : undefined,
      requestId: messageId,
      topicArn: env.aws.snsTopicArn ? 'SET' : 'NOT SET',
      region: env.aws.region || 'NOT SET'
    });
    
    throw error;
  }
}

export default {
  publishToSns
}; 