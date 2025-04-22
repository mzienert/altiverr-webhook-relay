// Test script for retrieving messages from the queue
require('dotenv').config();
const axios = require('axios');
const crypto = require('crypto');

// Get the environment variables
const QUEUE_API_KEY = process.env.QUEUE_API_KEY;
const VERCEL_TOKEN = process.env.VERCEL_TOKEN;
const API_KEY = process.env.QUEUE_API_KEY || 'default-key-replace-me';

// Project info
const PROJECT_ID = "prj_WssVfAIzMVX08kD06GYdFtAS8kr2";
const ORG_ID = "team_89TzP27gNX2XIzyLEbPKmQUi";

// Function to get the latest deployment URL
async function getLatestDeploymentUrl() {
  try {
    console.log('Fetching the latest deployment URL from Vercel...');
    
    const vercelResponse = await axios.get(
      `https://api.vercel.com/v6/deployments?projectId=${PROJECT_ID}&teamId=${ORG_ID}&target=production&limit=1`,
      {
        headers: {
          Authorization: `Bearer ${VERCEL_TOKEN}`
        }
      }
    );
    
    if (vercelResponse.data && vercelResponse.data.deployments && vercelResponse.data.deployments.length > 0) {
      const latestUrl = vercelResponse.data.deployments[0].url;
      return `https://${latestUrl}/api`;
    } else {
      throw new Error('No deployments found');
    }
  } catch (error) {
    console.error('Error fetching deployment URL:', error.message);
    throw error;
  }
}

// Function to retrieve messages from the queue
async function getQueueMessages(baseUrl, maxMessages = 10) {
  try {
    console.log(`Retrieving up to ${maxMessages} messages from the queue...`);
    
    const response = await axios.get(`${baseUrl}/queue?max=${maxMessages}`, {
      headers: {
        'x-api-key': API_KEY
      }
    });
    
    return response.data;
  } catch (error) {
    console.error('Error retrieving queue messages:', error.response ? error.response.data : error.message);
    throw error;
  }
}

// Function to delete a message from the queue
async function deleteMessage(baseUrl, receiptHandle) {
  try {
    console.log(`Deleting message with receipt handle: ${receiptHandle.substring(0, 20)}...`);
    
    const response = await axios.post(`${baseUrl}/delete-message`, 
      { receiptHandle }, 
      {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': API_KEY
        }
      }
    );
    
    return response.data;
  } catch (error) {
    console.error('Error deleting message:', error.response ? error.response.data : error.message);
    throw error;
  }
}

// Main function
async function main() {
  try {
    // Get the base URL for API calls
    const baseUrl = await getLatestDeploymentUrl();
    console.log(`Using API base URL: ${baseUrl}`);
    
    // Get messages from the queue
    const messagesResponse = await getQueueMessages(baseUrl);
    
    if (messagesResponse.count === 0) {
      console.log('No messages found in the queue.');
      return;
    }
    
    console.log(`Found ${messagesResponse.count} messages:`);
    
    // Display the messages
    messagesResponse.messages.forEach((message, index) => {
      console.log(`\nMessage #${index + 1}:`);
      console.log('  ID:', message.id);
      console.log('  Receipt Handle:', message.receiptHandle.substring(0, 20) + '...');
      console.log('  Body:', JSON.stringify(message.body, null, 2));
      
      // Prompt to delete the message
      if (process.argv.includes('--delete')) {
        deleteMessage(baseUrl, message.receiptHandle)
          .then(result => {
            console.log(`  ✅ Message deleted: ${result.message}`);
          })
          .catch(err => {
            console.error(`  ❌ Failed to delete message:`, err.message);
          });
      }
    });
    
    if (!process.argv.includes('--delete')) {
      console.log('\nTo delete these messages, run with --delete flag');
    }
  } catch (error) {
    console.error('Error in main function:', error.message);
    process.exit(1);
  }
}

main(); 