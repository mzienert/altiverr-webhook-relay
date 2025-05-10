import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import { createHttpTerminator } from 'http-terminator';
import routes from './routes/index.js';
import env from '../config/env.js';
import logger from './utils/logger.js';
import { sendStartupNotification, sendErrorNotification } from './services/notification.service.js';
import { getWebhookUrl } from './utils/webhookUrl.js';
import { requestLogger, bodyParser, errorHandler } from './middleware/index.js';

// Create Express app
const app = express();

// Apply middleware
app.use(helmet());
app.use(cors());
app.use(morgan('dev', {
  stream: { 
    write: message => logger.debug(message.trim()) 
  }
}));

// Apply custom middleware
app.use(requestLogger);
app.use(bodyParser);

// Register routes
app.use('/', routes);

// Error handling middleware
app.use(errorHandler);

// Start the server
const server = app.listen(env.server.port, env.server.host, () => {
  // Get the currently active webhook URL based on environment
  const currentWebhookUrl = getWebhookUrl();
  
  logger.info(`Webhook proxy started at http://${env.server.host}:${env.server.port}`);
  logger.info(`Public URL: ${env.server.publicUrl}`);
  logger.info(`Forwarding to n8n at: ${currentWebhookUrl}`);
  
  // Send startup notification
  sendStartupNotification();
});

// Set up graceful shutdown
const httpTerminator = createHttpTerminator({ server });

async function gracefulShutdown(signal) {
  logger.info(`Received ${signal}, shutting down gracefully...`);
  
  try {
    await httpTerminator.terminate();
    logger.info('HTTP server closed');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown', { error: error.message });
    process.exit(1);
  }
}

// Handle termination signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', { error: error.message, stack: error.stack });
  sendErrorNotification('Uncaught exception', { error: error.message });
  
  // Exit after a brief delay to allow for logging and notifications
  setTimeout(() => {
    process.exit(1);
  }, 1000);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled promise rejection', { 
    reason: reason?.message || String(reason),
    stack: reason?.stack
  });
  
  sendErrorNotification('Unhandled promise rejection', { 
    reason: reason?.message || String(reason)
  });
});

export default app; 