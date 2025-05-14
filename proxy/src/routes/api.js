import express from 'express';
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';
import env from '../../config/env.js';
import logger from '../utils/logger.js';

// ES module fix for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Get logs
router.get('/logs', (req, res) => {
  try {
    const limit = parseInt(req.query.limit || '100', 10);
    const logPath = path.resolve(__dirname, '../../../logs/proxy.log');
    
    // Check if log file exists
    if (!fs.existsSync(logPath)) {
      return res.json([]);
    }
    
    // Parse log file (simplified approach, assumes one log entry per line)
    const logs = fs.readFileSync(logPath, 'utf8')
      .split('\n')
      .filter(line => line.trim())
      .map(line => {
        try {
          // Parse timestamp and level from log line
          const timestampMatch = line.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)/);
          const levelMatch = line.match(/\[(info|error|warn|debug)\]:/i);
          
          const timestamp = timestampMatch ? timestampMatch[1] : new Date().toISOString();
          const level = levelMatch ? levelMatch[1].toLowerCase() : 'info';
          
          // Extract message (everything after the level)
          let message = line;
          if (levelMatch) {
            const levelIndex = line.indexOf(levelMatch[0]) + levelMatch[0].length;
            message = line.substring(levelIndex).trim();
          }
          
          // Check if there's any JSON metadata in the message
          let meta = {};
          const jsonMatch = message.match(/\{.*\}$/);
          if (jsonMatch) {
            try {
              meta = JSON.parse(jsonMatch[0]);
              message = message.substring(0, message.indexOf(jsonMatch[0])).trim();
            } catch (e) {
              // Not valid JSON, leave message as is
            }
          }
          
          return { timestamp, level, message, meta };
        } catch (e) {
          // If parsing fails, return a basic log entry
          return { 
            timestamp: new Date().toISOString(), 
            level: 'error', 
            message: `Error parsing log line: ${line}`,
            meta: { error: e.message }
          };
        }
      })
      .slice(0, limit)
      .reverse();  // Most recent first
    
    res.json(logs);
  } catch (error) {
    logger.error('Error fetching logs', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Get proxy status
router.get('/status', (req, res) => {
  try {
    // Get uptime
    const uptime = process.uptime();
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = Math.floor(uptime % 60);
    const uptimeStr = `${hours}h ${minutes}m ${seconds}s`;
    
    // Get memory usage
    const memoryUsage = process.memoryUsage();
    const memoryUsageMB = Math.round(memoryUsage.rss / 1024 / 1024 * 100) / 100;
    
    // Get CPU usage (simplified)
    const cpuUsage = process.cpuUsage();
    const cpuUsagePercent = Math.round((cpuUsage.user + cpuUsage.system) / 1000 / 100) / 100;
    
    // Get process info
    const pid = process.pid;
    
    res.json({
      state: 'running',
      uptime: uptimeStr,
      memory: `${memoryUsageMB} MB`,
      cpu: `${cpuUsagePercent}%`,
      port: env.server.port,
      environment: env.server.env,
      publicUrl: env.server.publicUrl,
      pid
    });
  } catch (error) {
    logger.error('Error fetching proxy status', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Get proxy configuration
router.get('/config', (req, res) => {
  try {
    // Return sanitized configuration (remove sensitive data)
    const sanitizedConfig = {
      server: {
        port: env.server.port,
        host: env.server.host,
        env: env.server.env,
        logLevel: env.server.logLevel,
        publicUrl: env.server.publicUrl
      },
      n8n: {
        webhookUrl: env.n8n.webhookUrl,
        webhookUrlDev: env.n8n.webhookUrlDev,
        calendly: {
          webhookUrl: env.n8n.calendly.webhookUrl,
          webhookUrlDev: env.n8n.calendly.webhookUrlDev
        },
        slack: {
          webhookUrl: env.n8n.slack.webhookUrl,
          webhookUrlDev: env.n8n.slack.webhookUrlDev
        },
        timeout: env.n8n.timeout
      },
      notifications: {
        notifyOnStart: env.notifications.notifyOnStart,
        notifyOnError: env.notifications.notifyOnError
      }
    };
    
    res.json(sanitizedConfig);
  } catch (error) {
    logger.error('Error fetching proxy config', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Restart proxy
router.post('/restart', (req, res) => {
  try {
    logger.info('Restart request received from UI');
    
    // Send response before restarting
    res.json({ message: 'Restarting proxy...' });
    
    // Use process.send for PM2 managed processes
    if (process.send) {
      logger.info('Sending restart signal via PM2');
      process.send('restart');
    } else {
      // For non-PM2 environments, could use a more complex restart strategy
      logger.warn('Process not managed by PM2, cannot restart via process.send');
      
      // Example fallback (would work if server has proper permissions)
      // const scriptPath = path.resolve(__dirname, '../../../scripts/restart-services.sh');
      // execSync(`bash ${scriptPath}`);
    }
  } catch (error) {
    logger.error('Error restarting proxy', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// Set proxy mode
router.post('/mode', (req, res) => {
  try {
    const { mode } = req.body;
    
    if (!mode || !['development', 'production'].includes(mode)) {
      return res.status(400).json({ error: 'Invalid mode. Must be "development" or "production"' });
    }
    
    logger.info(`Mode change request received from UI: ${mode}`);
    
    // Update environment variable (for this process only)
    process.env.NODE_ENV = mode;
    
    // Send response
    res.json({ 
      message: `Mode changed to ${mode}`, 
      mode,
      requiresRestart: true
    });
  } catch (error) {
    logger.error('Error setting proxy mode', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

export default router; 