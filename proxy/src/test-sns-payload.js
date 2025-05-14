import axios from 'axios';
import logger from './utils/logger.js';

// Test SNS message similar to what we're seeing in the logs
const testSnsMessage = {
  "Message": "{\"data\":{\"metadata\":{\"source\":\"slack\"},\"payload\":{\"original\":{\"type\":\"event_callback\",\"event\":{\"type\":\"message\",\"channel\":\"C08Q6C6J4BZ\",\"text\":\"test message\",\"user\":\"U08ME847MV2\"},\"team_id\":\"T08ME847DE0\"}},\"channel\":\"C08Q6C6J4BZ\",\"team_id\":\"T08ME847DE0\"}}"
};

// Test direct Slack message
const testSlackMessage = {
  "type": "event_callback",
  "event": {
    "type": "message",
    "channel": "C08Q6C6J4BZ",
    "text": "test message",
    "user": "U08ME847MV2"
  },
  "team_id": "T08ME847DE0"
};

async function runTests() {
  try {
    logger.info('Starting SNS webhook relay tests');

    // Test 1: Send SNS payload to the proxy's direct webhook endpoint
    logger.info('TEST 1: Sending SNS message to webhook endpoint');
    try {
      const snsResponse = await axios.post('http://localhost:3333/webhook/09210404-b3f7-48c7-9cd2-07f922bc4b14/webhook', testSnsMessage, {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Amazon SNS'
        }
      });
      logger.info('SNS test response:', {
        status: snsResponse.status,
        data: snsResponse.data
      });
    } catch (error) {
      logger.error('SNS test failed:', {
        error: error.message,
        response: error.response?.data
      });
    }

    // Test 2: Send direct Slack payload to the dedicated Slack endpoint
    logger.info('TEST 2: Sending direct Slack message to dedicated endpoint');
    try {
      const slackResponse = await axios.post('http://localhost:3333/webhook/slack', testSlackMessage, {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Slackbot 1.0 (+https://api.slack.com/robots)'
        }
      });
      logger.info('Slack test response:', {
        status: slackResponse.status,
        data: slackResponse.data
      });
    } catch (error) {
      logger.error('Slack test failed:', {
        error: error.message,
        response: error.response?.data
      });
    }

    // Test 3: Send direct Slack payload to the debug endpoint
    logger.info('TEST 3: Sending Slack message to debug endpoint');
    try {
      const debugResponse = await axios.post('http://localhost:3333/debug/slack', testSlackMessage, {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Slackbot 1.0 (+https://api.slack.com/robots)'
        }
      });
      logger.info('Debug test response:', {
        status: debugResponse.status,
        data: debugResponse.data
      });
    } catch (error) {
      logger.error('Debug test failed:', {
        error: error.message,
        response: error.response?.data
      });
    }

  } catch (error) {
    logger.error('Test runner error:', {
      error: error.message,
      stack: error.stack
    });
  }
}

runTests().catch(err => {
  logger.error('Unhandled error in test runner:', err);
  process.exit(1);
}); 