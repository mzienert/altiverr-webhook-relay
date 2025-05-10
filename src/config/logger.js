import winston from 'winston';
import env from './env.js';
import fs from 'fs';

const { combine, timestamp, printf, colorize } = winston.format;

// Custom format for console logs
const logFormat = printf(({ level, message, timestamp, ...meta }) => {
  const metaString = Object.keys(meta).length ? JSON.stringify(meta) : '';
  return `${timestamp} [${level}]: ${message} ${metaString}`;
});

// Check if running in Vercel or another serverless environment
const isServerless = process.env.VERCEL === '1' || process.env.AWS_LAMBDA_FUNCTION_NAME;

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

// Add file transports only if not in serverless environment and in production
if (env.api.env === 'production' && !isServerless) {
  try {
    // Create logs directory if it doesn't exist
    if (!fs.existsSync('logs')) {
      fs.mkdirSync('logs');
    }
    
    logger.add(
      new winston.transports.File({ 
        filename: 'logs/error.log', 
        level: 'error',
        maxsize: 5242880, // 5MB
        maxFiles: 5
      })
    );
    logger.add(
      new winston.transports.File({ 
        filename: 'logs/combined.log',
        maxsize: 5242880, // 5MB
        maxFiles: 5
      })
    );
    
    logger.info('File logging enabled');
  } catch (error) {
    logger.warn('Unable to initialize file logging', { error: error.message });
    // Continue without file logging
  }
}

export default logger; 