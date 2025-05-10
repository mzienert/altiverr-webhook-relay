#!/usr/bin/env node

import axios from 'axios';
import AWS from 'aws-sdk';
import crypto from 'crypto';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { getWebhookUrl } from './src/utils/webhookUrl.js';

// Load environment variables from .env
dotenv.config();

// Function to test the proxy directly
async function testProxyDirectly() {
  try {
    // Get the webhook URL from the utility function to ensure consistency
    const proxyUrl = getWebhookUrl('calendly');
    
    console.log(`🚀 Testing proxy directly at: ${proxyUrl}`);
    
    // Create a simplified webhook payload without the SNS wrapper
    const directPayload = normalizedWebhook;
    
    // Send a request directly to the webhook endpoint
    // ... rest of the existing code ...
  } catch (error) {
    console.error('Error testing proxy directly:', error);
  }
} 