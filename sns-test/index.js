import AWS from 'aws-sdk';

// Configure AWS
AWS.config.update({
  region: process.env.AWS_REGION || 'us-west-1',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

const sns = new AWS.SNS();
const topicArn = process.env.SNS_TOPIC_ARN;

console.log('SNS Topic ARN:', topicArn);
console.log('AWS Region:', process.env.AWS_REGION);
console.log('AWS Access Key ID:', process.env.AWS_ACCESS_KEY_ID ? '✓ (Set)' : '✗ (Not Set)');
console.log('AWS Secret Access Key:', process.env.AWS_SECRET_ACCESS_KEY ? '✓ (Set)' : '✗ (Not Set)');

// Test publish
async function testPublish() {
  try {
    if (!topicArn) {
      throw new Error('SNS_TOPIC_ARN is not set');
    }
    
    const params = {
      Message: JSON.stringify({
        id: 'test-message-' + Date.now(),
        data: { source: 'test', message: 'This is a test message' },
        timestamp: new Date().toISOString()
      }),
      TopicArn: topicArn
    };
    
    console.log('Publishing test message to SNS...');
    const result = await sns.publish(params).promise();
    console.log('Successfully published to SNS:', result.MessageId);
    return result;
  } catch (error) {
    console.error('Failed to publish to SNS:', error);
    throw error;
  }
}

// Run the test
testPublish()
  .then(() => console.log('Test completed'))
  .catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
  }); 