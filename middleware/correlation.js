/**
 * Correlation ID Middleware.
 */

const { v4: uuidv4 } = require('uuid');
const config = require('../config');
const logger = require('../utils/logger');

/**
 * Middleware to attach a Correlation ID to the request and response.
 */
const correlationMiddleware = (req, res, next) => {
  const headerName = config.correlationHeader;

  // Check for existing ID or create new one
  const correlationId = req.headers[headerName] || uuidv4();

  // Attach to request object for internal logger usage
  req.correlationId = correlationId;

  // Create child logger with automatic request ID injection
  // Usage: req.log.info('Message') automatically includes reqId
  req.log = logger.child({ reqId: correlationId });

  // Return in response headers
  // This helps support teams trace issues when users report an error ID
  res.setHeader(headerName, correlationId);

  next();
};

module.exports = correlationMiddleware;
