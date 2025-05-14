import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import { createHttpTerminator } from 'http-terminator';
import { Server } from 'socket.io';
import routes from './routes/index.js';
import env from '../config/env.js';
import logger from './utils/logger.js';
import { sendStartupNotification, sendErrorNotification } from './services/notification.service.js';
import { getWebhookUrl } from './utils/webhookUrl.js';
import { requestLogger, bodyParser, errorHandler } from './middleware/index.js';

// Create Express app
const app = express();

// Apply middleware
app.use(helmet({
  // Allow WebSocket connection for the client
  contentSecurityPolicy: {
    directives: {
      connectSrc: ["'self'", "ws:", "wss:"]
    }
  }
}));
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
  
  // Get the Slack webhook URL for clarity
  const nodeEnv = process.env.NODE_ENV || 'development';
  const slackWebhookId = env.n8n.slack.webhookId;
  const slackWebhookUrl = nodeEnv === 'production'
    ? `http://localhost:5678/webhook/${slackWebhookId}/webhook`
    : `http://localhost:5678/webhook-test/${slackWebhookId}/webhook`;
  
  logger.info(`Webhook proxy started at http://${env.server.host}:${env.server.port}`);
  logger.info(`Public URL: ${env.server.publicUrl}`);
  logger.info(`Default webhook URL: ${currentWebhookUrl}`);
  logger.info(`Slack webhook URL: ${slackWebhookUrl}`);
  logger.info(`Calendly webhook URL: ${env.n8n.calendly.webhookUrl}`);
  
  // Send startup notification
  sendStartupNotification();
});

// Set up WebSockets
const io = new Server(server, {
  cors: {
    origin: '*', // In production you should restrict this
    methods: ['GET', 'POST']
  }
});

// Socket.io events
io.on('connection', (socket) => {
  logger.info('Client connected to WebSocket', { socketId: socket.id });
  
  // Send current status on connection
  const status = {
    state: 'running',
    uptime: formatUptime(process.uptime()),
    memory: `${Math.round(process.memoryUsage().rss / 1024 / 1024 * 100) / 100} MB`,
    cpu: `${Math.round((process.cpuUsage().user + process.cpuUsage().system) / 1000 / 100) / 100}%`,
    port: env.server.port,
    environment: env.server.env,
    publicUrl: env.server.publicUrl,
    pid: process.pid
  };
  
  socket.emit('status', status);
  
  // Handle disconnect
  socket.on('disconnect', () => {
    logger.info('Client disconnected from WebSocket', { socketId: socket.id });
  });
});

// Override the default log method to also emit to connected clients
const originalLoggerInfo = logger.info;
const originalLoggerError = logger.error;
const originalLoggerWarn = logger.warn;
const originalLoggerDebug = logger.debug;

// Helper to format uptime
function formatUptime(uptime) {
  const hours = Math.floor(uptime / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  const seconds = Math.floor(uptime % 60);
  return `${hours}h ${minutes}m ${seconds}s`;
}

// Wrap log methods to also emit to socket
logger.info = function (message, meta) {
  originalLoggerInfo(message, meta);
  emitLog('info', message, meta);
};

logger.error = function (message, meta) {
  originalLoggerError(message, meta);
  emitLog('error', message, meta);
};

logger.warn = function (message, meta) {
  originalLoggerWarn(message, meta);
  emitLog('warn', message, meta);
};

logger.debug = function (message, meta) {
  originalLoggerDebug(message, meta);
  emitLog('debug', message, meta);
};

// Emit log to all connected clients
function emitLog(level, message, meta) {
  if (io) {
    io.emit('log', {
      timestamp: new Date().toISOString(),
      level,
      message,
      meta: meta || {}
    });
  }
}

// Set up periodic status updates
setInterval(() => {
  if (io) {
    const status = {
      state: 'running',
      uptime: formatUptime(process.uptime()),
      memory: `${Math.round(process.memoryUsage().rss / 1024 / 1024 * 100) / 100} MB`,
      cpu: `${Math.round((process.cpuUsage().user + process.cpuUsage().system) / 1000 / 100) / 100}%`,
      port: env.server.port,
      environment: env.server.env,
      publicUrl: env.server.publicUrl,
      pid: process.pid
    };
    
    io.emit('status', status);
  }
}, 5000); // Every 5 seconds

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