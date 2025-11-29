/**
 * Download Rate Limiter Middleware
 *
 * Prevents abuse of the file download endpoint by limiting downloads per IP.
 */

const rateLimit = require('express-rate-limit');
const logger = require('../utils/logger');

/**
 * Rate limiter for file downloads.
 */
const downloadRateLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 10, // 10 downloads per window

  // Key by IP address
  keyGenerator: (req) => req.ip,

  // Custom handler for rate limit exceeded
  handler: (req, res) => {
    logger.warn('Download rate limit exceeded', {
      ip: req.ip,
      userAgent: req.get('user-agent'),
      correlationId: req.correlationId
    });

    res.status(429).send('Download rate limit exceeded. Please try again in 5 minutes.');
  },

  // Standard headers for rate limit info
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers
});

module.exports = downloadRateLimiter;
