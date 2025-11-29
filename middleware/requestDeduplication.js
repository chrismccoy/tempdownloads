/**
 * Request Deduplication Middleware.
 *
 * Prevents duplicate processing of identical concurrent requests.
 * Useful for preventing double-submissions when users click buttons multiple times.
 */

const crypto = require('crypto');
const logger = require('../utils/logger');
const { TIMEOUTS } = require('../constants');

/**
 * Maps fingerprint -> { promise, timestamp }
 */
const inFlightRequests = new Map();

/**
 * Cleanup interval: Remove stale entries every 5 minutes.
 */
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 60 * 1000; // Consider request stale after 60 seconds

/**
 * Cleanup stale in-flight requests.
 */
setInterval(() => {
  const now = Date.now();
  let removedCount = 0;

  for (const [fingerprint, entry] of inFlightRequests.entries()) {
    if (now - entry.timestamp > REQUEST_TIMEOUT_MS) {
      inFlightRequests.delete(fingerprint);
      removedCount++;
    }
  }

  if (removedCount > 0) {
    logger.info(`🧹 [DEDUP] Cleaned up ${removedCount} stale in-flight requests`);
  }
}, CLEANUP_INTERVAL_MS);

/**
 * Generates a fingerprint for a request.
 * Combines method, path, user ID, and body hash.
 */
function generateFingerprint(req) {
  const components = [
    req.method,
    req.path,
    req.session?.userId || 'anonymous',
  ];

  // Include body hash for POST/PUT/PATCH requests
  if (req.body && Object.keys(req.body).length > 0) {
    const bodyHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(req.body))
      .digest('hex')
      .substring(0, 16);
    components.push(bodyHash);
  }

  return components.join(':');
}

/**
 * Request Deduplication Middleware.
 */
function requestDeduplication(options = {}) {
  const {
    methods = ['POST', 'PUT', 'PATCH', 'DELETE'],
    windowMs = 5000 // 5 seconds
  } = options;

  return async (req, res, next) => {
    // Skip if method not in deduplication list
    if (!methods.includes(req.method)) {
      return next();
    }

    const fingerprint = generateFingerprint(req);
    const existing = inFlightRequests.get(fingerprint);

    // Check if identical request is already in-flight
    if (existing) {
      const age = Date.now() - existing.timestamp;

      // Only deduplicate within the configured window
      if (age < windowMs) {
        logger.warn({
          reqId: req.correlationId,
          fingerprint: fingerprint.substring(0, 32),
          age: `${age}ms`,
          method: req.method,
          path: req.path
        }, '🔄 [DEDUP] Duplicate request detected - waiting for original');

        try {
          // Wait for the original request to complete
          const result = await existing.promise;

          // Send the same response
          logger.info({
            reqId: req.correlationId,
            fingerprint: fingerprint.substring(0, 32)
          }, '✅ [DEDUP] Returning cached response');

          return res.status(result.status).json(result.body);
        } catch (error) {
          // Original request failed - let this one proceed
          logger.warn({
            reqId: req.correlationId,
            err: error.message
          }, '⚠️  [DEDUP] Original request failed - proceeding with duplicate');

          inFlightRequests.delete(fingerprint);
        }
      } else {
        // Request too old - consider it stale and remove it
        inFlightRequests.delete(fingerprint);
      }
    }

    // Create promise to track this request
    const requestPromise = new Promise((resolve, reject) => {
      // Capture the original res.json method
      const originalJson = res.json.bind(res);

      // Override res.json to capture response
      res.json = function(body) {
        const result = {
          status: res.statusCode,
          body
        };

        // Resolve the promise with the result
        resolve(result);

        // Clean up the in-flight tracker
        inFlightRequests.delete(fingerprint);

        // Call original json method
        return originalJson(body);
      };

      // Handle errors
      res.on('error', (error) => {
        reject(error);
        inFlightRequests.delete(fingerprint);
      });

      // Handle response finish (for non-JSON responses)
      res.on('finish', () => {
        // Clean up if not already resolved
        setTimeout(() => {
          inFlightRequests.delete(fingerprint);
        }, 1000);
      });
    });

    // Track this request
    inFlightRequests.set(fingerprint, {
      promise: requestPromise,
      timestamp: Date.now()
    });

    // Proceed with request processing
    next();
  };
}

/**
 * Get deduplication statistics (for monitoring).
 */
function getDeduplicationStats() {
  return {
    inFlight: inFlightRequests.size,
    windowMs: TIMEOUTS.DEDUP_WINDOW_MS
  };
}

module.exports = { requestDeduplication, getDeduplicationStats };
