import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import xssClean from 'xss-clean';

import logger from './logger.js';
import env from './env.js';

// Create Express app
function createApp() {
  const app = express();
  
  // Apply security middleware
  app.use(helmet());
  app.use(cors());
  app.use(xssClean());
  
  // Parse JSON requests
  app.use(express.json({ limit: '250kb' })); // SNS payload limit is 256KB
  app.use(express.urlencoded({ extended: true, limit: '250kb' }));
  
  // Set up logging middleware
  if (env.api.env === 'development') {
    app.use(morgan('dev'));
  } else {
    app.use(morgan('combined', {
      stream: { write: message => logger.info(message.trim()) }
    }));
  }
  
  // Health check endpoint
  app.get('/health', (req, res) => {
    res.status(200).json({
      status: 'ok',
      message: 'Webhook relay service is running',
      timestamp: new Date().toISOString()
    });
  });
  
  return app;
}

export default createApp; 