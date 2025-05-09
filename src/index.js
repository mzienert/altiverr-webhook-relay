import createApp from './config/express.js';
import routes from './routes/index.js';
import { notFoundHandler, errorHandler } from './middlewares/error.js';
import env from './config/env.js';
import logger from './config/logger.js';
import { validateSnsConfig } from './config/aws.js';

// Initialize Express app
const app = createApp();

// Register API routes
app.use('/api', routes);

// Register error handlers
app.use(notFoundHandler);
app.use(errorHandler);

// Start server
const startServer = async () => {
  try {
    // Validate AWS SNS configuration
    const snsConfigValid = await validateSnsConfig();
    
    if (!snsConfigValid) {
      logger.warn('SNS configuration validation failed - webhooks will be accepted but may not be delivered');
    }
    
    // Start listening
    const port = env.api.port;
    app.listen(port, () => {
      logger.info(`Server started on port ${port} (${env.api.env})`);
      logger.info(`Health check available at: http://localhost:${port}/health`);
      logger.info(`API available at: http://localhost:${port}/api`);
      
      // Log webhook URLs
      logger.info('Webhook endpoints:');
      logger.info(`- Calendly: http://localhost:${port}/api/webhook/calendly`);
    });
  } catch (error) {
    logger.error('Failed to start server', { error: error.message, stack: error.stack });
    process.exit(1);
  }
};

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', { error: error.message, stack: error.stack });
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled promise rejection', { 
    reason: reason?.message || String(reason),
    stack: reason?.stack
  });
});

// Start the server
startServer(); 