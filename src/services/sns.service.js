import { PublishCommand } from '@aws-sdk/client-sns';
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
    
    const command = new PublishCommand({
      Message: JSON.stringify(message),
      TopicArn: env.aws.snsTopicArn,
      MessageAttributes: {
        'id': {
          DataType: 'String',
          StringValue: messageId
        }
      }
    });
    
    logger.debug('Attempting to publish message to SNS', {
      messageId,
      topicArn: command.input.TopicArn,
      dataSize: JSON.stringify(data).length
    });
    
    // Log detailed environment info for debugging
    logger.info('Detailed AWS environment check', {
      messageId,
      region: env.aws.region,
      topicArn: env.aws.snsTopicArn,
      credentialsLength: {
        accessKey: env.aws.accessKeyId?.length || 0,
        secretKey: env.aws.secretAccessKey?.length || 0
      },
      nodeEnv: process.env.NODE_ENV,
      vercelEnv: process.env.VERCEL_ENV
    });
    
    // Add timeout and detailed logging to debug the issue
    logger.info('About to call sns.publish()', { messageId });
    
    logger.info('Calling sns.send() directly...', { messageId });
    
    // Simplified approach - direct call with manual timeout
    const result = await Promise.race([
      sns.send(command),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('SNS timeout after 15 seconds')), 15000)
      )
    ]);
    
    logger.info('SNS send completed successfully', { 
      messageId, 
      resultMessageId: result.MessageId,
      resultType: typeof result
    });
    
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