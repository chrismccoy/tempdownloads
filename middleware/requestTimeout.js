/**
 * Request Timeout Middleware.
 *
 * Automatically terminates long-running requests to prevent resource exhaustion.
 * Protects against slow attacks and hung requests.
 */

const logger = require('../utils/logger');

/**
 * Default timeout: 30 seconds
 */
const DEFAULT_TIMEOUT_MS = 30000;

/**
 * Request Timeout Middleware.
 *
 * Terminates requests that exceed the specified timeout.
 */
function requestTimeout(options = {}) {
  const {
    timeout = DEFAULT_TIMEOUT_MS,
    onTimeout = null,
    exclude = []
  } = options;

  return (req, res, next) => {
    // Check if this route should be excluded
    const isExcluded = exclude.some(pattern => {
      if (pattern instanceof RegExp) {
        return pattern.test(req.path);
      }
      return req.path.startsWith(pattern);
    });

    if (isExcluded) {
      return next();
    }

    // Track if request has already finished
    let finished = false;

    // Set timeout timer
    const timer = setTimeout(() => {
      // Don't do anything if request already finished
      if (finished || res.headersSent) {
        return;
      }

      finished = true;

      // Log timeout event
      logger.warn({
        reqId: req.correlationId,
        method: req.method,
        path: req.path,
        timeout: `${timeout}ms`,
        ip: req.ip,
        userAgent: req.get('user-agent')
      }, '⏱️  [TIMEOUT] Request exceeded timeout limit');

      // Call custom timeout handler if provided
      if (onTimeout) {
        try {
          onTimeout(req, res);
        } catch (error) {
          logger.error({
            reqId: req.correlationId,
            err: error
          }, 'Custom timeout handler failed');
        }
      }

      // Send timeout response
      if (!res.headersSent) {
        res.status(408).json({
          success: false,
          message: 'Request timeout. The operation took too long to complete.',
          error: 'REQUEST_TIMEOUT',
          timeout: `${timeout}ms`
        });
      }

      // Emit 'timeout' event for cleanup
      req.emit('timeout');
    }, timeout);

    // Clear timeout when response finishes
    const cleanup = () => {
      finished = true;
      clearTimeout(timer);
    };

    // Listen for response events
    res.on('finish', cleanup);
    res.on('close', cleanup);
    res.on('error', cleanup);

    // Attach timeout info to request for logging
    req.timeout = timeout;
    req.timeoutStart = Date.now();

    // Proceed to next middleware
    next();
  };
}

/**
 * Creates a timeout middleware with specific timeout for certain routes.
 */
function timeoutAfter(timeout) {
  return requestTimeout({ timeout });
}

/**
 * Middleware to set custom timeout for specific routes.
 * Use this for operations that need more time (e.g., file uploads, reports).
 */
function timeoutAfterMinutes(minutes) {
  return requestTimeout({ timeout: minutes * 60 * 1000 });
}

module.exports = {
  requestTimeout,
  timeoutAfter,
  timeoutAfterMinutes
};
