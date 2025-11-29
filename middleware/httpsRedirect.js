/**
 * HTTPS Redirect Middleware.
 *
 * Enforces HTTPS connections in production by redirecting all HTTP requests.
 * Works correctly behind reverse proxies (Nginx, Cloudflare, AWS ALB) by checking
 * the X-Forwarded-Proto header.
 */

const logger = require('../utils/logger');
const config = require('../config');

/**
 * Middleware to redirect HTTP to HTTPS in production.
 *
 * Checks both req.secure (direct HTTPS) and X-Forwarded-Proto header (proxy HTTPS).
 * Returns 301 (Permanent Redirect) to instruct browsers to remember the redirect.
 */
function httpsRedirect(req, res, next) {
  // Only enforce in production
  if (config.env !== 'production') {
    return next();
  }

  // Check if request is already secure
  const isSecure = req.secure || req.get('X-Forwarded-Proto') === 'https';

  if (!isSecure) {
    // Construct HTTPS URL
    const httpsUrl = `https://${req.get('host')}${req.originalUrl}`;

    logger.warn({
      reqId: req.correlationId,
      originalUrl: req.originalUrl,
      redirectTo: httpsUrl,
      ip: req.ip
    }, 'HTTP request redirected to HTTPS');

    // 301 Permanent Redirect
    return res.redirect(301, httpsUrl);
  }

  // Request is already secure - proceed
  next();
}

module.exports = httpsRedirect;
