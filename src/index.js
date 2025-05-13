import createApp from './config/express.js';
import routes from './routes/index.js';
import webhookRoutes from './routes/webhook.routes.js';
import { notFoundHandler, errorHandler } from './middlewares/error.js';
import env from './config/env.js';
import logger from './utils/logger.js';
import { validateSnsConfig } from './config/aws.js';
import slackController from './controllers/slack.controller.js';

// Initialize Express app
const app = createApp();

// Add health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'webhook-relay-api',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    env: env.api.env
  });
});

// Register API routes
app.use('/api', routes);

// Direct webhook routes - for compatibility with various clients
app.use('/api/webhook', webhookRoutes);
app.use('/webhook', webhookRoutes);  // Handle /webhook directly for clients that don't use /api prefix

// n8n specific webhook routes
app.use('/webhook-test', webhookRoutes); // Special handling for n8n development URLs

// Legacy Slack webhook route format detected in the logs
// Handle: /api/slack-webhook/{uuid}
app.post('/api/slack-webhook/:uuid', (req, res) => {
  logger.info('Received webhook on legacy slack-webhook path', {
    uuid: req.params.uuid,
    agent: req.headers['user-agent']
  });
  return slackController.handleSlackWebhook(req, res);
});

// Also handle GET requests for verification
app.get('/api/slack-webhook/:uuid', (req, res) => {
  logger.info('Received verification GET request on legacy slack-webhook path', {
    uuid: req.params.uuid
  });
  return res.status(200).json({
    success: true,
    message: 'Webhook endpoint is active'
  });
});

// Register error handlers
app.use(notFoundHandler);
app.use(errorHandler);

// Sample UUID for documentation
const sampleUuid = '09210404-b3f7-48c7-9cd2-07f922bc4b14';

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
      logger.info(`- Slack: http://localhost:${port}/api/webhook/slack`);
      logger.info(`- Generic: http://localhost:${port}/api/webhook`);
      logger.info(`- Direct: http://localhost:${port}/webhook`);
      
      // Log n8n specific webhook URLs
      logger.info('n8n webhook URLs:');
      logger.info('- Slack (Dev): http://localhost:5678/webhook-test/' + sampleUuid + '/webhook');
      logger.info('- Slack (Prod): http://localhost:5678/webhook/' + sampleUuid + '/webhook');
      logger.info('- Calendly (Dev): http://localhost:5678/webhook-test/calendly');
      logger.info('- Calendly (Prod): http://localhost:5678/webhook/calendly');
      
      // Log legacy format
      logger.info('Legacy webhook URLs (for compatibility):');
      logger.info(`- Legacy Slack: http://localhost:${port}/api/slack-webhook/${sampleUuid}`);
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