import logger from '../utils/logger.js';

/**
 * Custom body parsing middleware
 * Captures raw body for all request types for SNS signature verification
 * Attempts to parse JSON content when appropriate
 */
export const bodyParser = (req, res, next) => {
  let data = '';
  
  // Skip for empty body requests
  if (req.headers['content-length'] === '0') {
    next();
    return;
  }
  
  req.on('data', chunk => {
    data += chunk;
  });
  
  req.on('end', () => {
    req.rawBody = data;
    
    // Try to parse as JSON if content-type is json or not specified
    const contentType = req.headers['content-type'] || '';
    if (contentType.includes('json') || data.trim().startsWith('{')) {
      try {
        req.body = JSON.parse(data);
      } catch (e) {
        logger.warn(`Failed to parse request body as JSON: ${e.message}`, {
          contentType,
          bodyPreview: data.substring(0, 100)
        });
        // Keep the raw string as body
        req.body = data;
      }
    } else {
      // For non-JSON content types, keep as string
      req.body = data;
    }
    
    next();
  });
}; 