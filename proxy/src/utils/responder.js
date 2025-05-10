import logger from './logger.js';

/**
 * Utility for sending standardized API responses
 */
const responder = {
  /**
   * Send a success response
   * @param {object} res - Express response object
   * @param {number} statusCode - HTTP status code
   * @param {object|string} data - Response data
   * @param {string} message - Optional success message
   */
  success: (res, statusCode = 200, data = {}, message = '') => {
    const response = {
      success: true,
      ...(message && { message }),
      ...(Object.keys(data).length > 0 && { data })
    };
    
    return res.status(statusCode).json(response);
  },
  
  /**
   * Send an error response
   * @param {object} res - Express response object
   * @param {number} statusCode - HTTP status code
   * @param {string} message - Error message
   * @param {object} details - Optional error details
   */
  error: (res, statusCode = 500, message = 'Internal server error', details = {}) => {
    // Log the error
    if (statusCode >= 500) {
      logger.error(message, details);
    } else if (statusCode >= 400) {
      logger.warn(message, details);
    }
    
    const response = {
      success: false,
      error: true,
      message,
      ...(Object.keys(details).length > 0 && { details })
    };
    
    return res.status(statusCode).json(response);
  },
  
  /**
   * Send a 404 not found response
   * @param {object} res - Express response object
   * @param {string} message - Custom not found message
   */
  notFound: (res, message = 'Resource not found') => {
    return responder.error(res, 404, message);
  }
};

export default responder; 