/**
 * Link Password Rate Limiter Middleware
 *
 * Prevents brute force attacks on password-protected download links.
 * Limits password verification attempts to 5 per 15 minutes per link+IP combination.
 */

const rateLimit = require('express-rate-limit');
const { TIMEOUTS, LIMITS } = require('../constants');
const logger = require('../utils/logger');

/**
 * Rate limiter for password-protected link verification.
 */
const linkPasswordLimiter = rateLimit({
  windowMs: TIMEOUTS.RATE_LIMIT_WINDOW_MS,
  max: LIMITS.LINK_PASSWORD_RATE_LIMIT_MAX,

  // Generate unique key per link + IP combination
  keyGenerator: (req) => {
    const shortId = req.params.shortId || 'unknown';
    const ip = req.ip;
    return `link_password_${shortId}_${ip}`;
  },

  // Skip rate limiting for successful password entries
  // (This allows immediate retry after typo correction)
  skipSuccessfulRequests: true,

  // Custom handler for rate limit exceeded
  handler: (req, res) => {
    const shortId = req.params.shortId;

    logger.warn('Link password rate limit exceeded', {
      shortId,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      correlationId: req.correlationId
    });

    // Render the password form with error message
    res.status(429).render('public/password', {
      title: 'Protected Download',
      shortId,
      error: 'Too many password attempts. Please try again in 15 minutes.',
      link: req.link // Pass through link data if available
    });
  },

  // Standard headers for rate limit info
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers

});

module.exports = linkPasswordLimiter;
