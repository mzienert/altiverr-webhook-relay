import logger from '../utils/logger.js';

/**
 * Middleware for logging all requests and responses
 */
export const requestLogger = (req, res, next) => {
  const startTime = Date.now();
  
  // Log request
  logger.debug(`${req.method} ${req.path} - Request received`, {
    method: req.method,
    path: req.path,
    query: req.query,
    ip: req.ip
  });
  
  // Log response time on completion
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const level = res.statusCode >= 400 ? 'warn' : 'debug';
    
    logger[level](`${req.method} ${req.path} - Response sent ${res.statusCode}`, {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`
    });
  });
  
  next();
}; 