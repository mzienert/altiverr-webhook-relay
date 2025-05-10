import os from 'os';
import axios from 'axios';
import env from '../../config/env.js';
import logger from '../utils/logger.js';
import { getWebhookUrl } from '../utils/webhookUrl.js';
import responder from '../utils/responder.js';

// Track the proxy uptime
const startTime = new Date();

/**
 * Health check endpoint handler
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
export async function healthCheck(req, res) {
  try {
    // Check if detailed health check is requested
    const detailed = req.query.detailed === 'true';
    
    // Basic health info
    const health = {
      status: 'ok',
      service: 'webhook-proxy',
      uptime: Math.floor((Date.now() - startTime.getTime()) / 1000),
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      env: env.server.env
    };
    
    // Add more details if requested
    if (detailed) {
      // Get the appropriate webhook URL
      const n8nWebhookUrl = getWebhookUrl();
      
      // Try to check if n8n is reachable
      let n8nStatus = 'unknown';
      
      try {
        // Make a request to n8n to check if it's reachable
        // We just do a head request to avoid triggering any webhooks
        await axios.head(new URL(n8nWebhookUrl).origin, { 
          timeout: 2000 
        });
        n8nStatus = 'ok';
      } catch (error) {
        n8nStatus = 'error';
        logger.debug('n8n health check failed', { error: error.message });
      }
      
      // Add system info
      health.details = {
        system: {
          hostname: os.hostname(),
          platform: process.platform,
          arch: process.arch,
          nodeVersion: process.version,
          cpus: os.cpus().length,
          memory: {
            total: Math.round(os.totalmem() / (1024 * 1024)) + 'MB',
            free: Math.round(os.freemem() / (1024 * 1024)) + 'MB',
            usedPercent: Math.round((1 - os.freemem() / os.totalmem()) * 100) + '%'
          },
          uptime: Math.floor(os.uptime())
        },
        config: {
          port: env.server.port,
          publicUrl: env.server.publicUrl,
          awsRegion: env.aws.region,
          n8nWebhookUrl: n8nWebhookUrl,
          environment: process.env.NODE_ENV || 'development'
        },
        services: {
          n8n: n8nStatus
        }
      };
      
      // Add processed message stats
      health.details.stats = {
        processedMessages: global.processedMessages?.size || 0
      };
    }
    
    return responder.success(res, 200, health);
  } catch (error) {
    logger.error('Health check failed', { error: error.message });
    
    return responder.error(res, 500, 'Health check failed', { error: error.message });
  }
}

/**
 * Readiness check endpoint handler
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
export async function readinessCheck(req, res) {
  try {
    // Check if the proxy is ready to receive requests
    // For now, we just check if we're up, but this could be expanded
    // to check connections to SNS, n8n, etc.
    
    return responder.success(res, 200, {
      status: 'ready',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Readiness check failed', { error: error.message });
    
    return responder.error(res, 503, 'Service not ready', { error: error.message });
  }
}

export default {
  healthCheck,
  readinessCheck
}; 