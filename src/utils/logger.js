import winston from 'winston';
import env from '../config/env.js';

const { combine, timestamp, printf, colorize } = winston.format;

// Custom format for console logs
const logFormat = printf(({ level, message, timestamp, ...meta }) => {
  const metaString = Object.keys(meta).length ? JSON.stringify(meta) : '';
  return `${timestamp} [${level}]: ${message} ${metaString}`;
});

// Create logger instance
const logger = winston.createLogger({
  level: env.api.logLevel,
  format: combine(
    timestamp(),
    logFormat
  ),
  transports: [
    new winston.transports.Console({
      format: combine(
        colorize(),
        timestamp(),
        logFormat
      )
    })
  ]
});

// Add file transports in production
if (env.api.env === 'production') {
  // Use dynamic import for fs to avoid issues in environments where it might not be available
  (async () => {
    try {
      // Ensure logs directory exists
      const fs = await import('fs');
      const { promises: fsPromises } = fs;
      const logsDir = './logs';
      
      try {
        await fsPromises.access(logsDir);
      } catch (error) {
        await fsPromises.mkdir(logsDir, { recursive: true });
      }
      
      // Add file transports
      logger.add(
        new winston.transports.File({ 
          filename: 'logs/api-error.log', 
          level: 'error',
          maxsize: 5242880, // 5MB
          maxFiles: 5
        })
      );
      
      logger.add(
        new winston.transports.File({ 
          filename: 'logs/api.log',
          maxsize: 5242880, // 5MB
          maxFiles: 5
        })
      );
      
      logger.info('File logging enabled');
    } catch (error) {
      logger.warn('Unable to initialize file logging', { error: error.message });
      // Continue without file logging
    }
  })();
}

export default logger; 