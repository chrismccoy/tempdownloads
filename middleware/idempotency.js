/**
 * Idempotency Middleware.
 *
 * Prevents duplicate execution of expensive operations (file uploads, deletions).
 * Uses an Idempotency-Key header to track operation completion.
 */

const logger = require('../utils/logger');

// In-memory cache for idempotency keys
// Format: { key: { statusCode, body, timestamp } }
const idempotencyCache = new Map();

// Cache TTL: 24 hours
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Cleanup expired entries every hour to prevent memory leaks.
 */
setInterval(() => {
  const now = Date.now();
  let removedCount = 0;

  for (const [key, value] of idempotencyCache.entries()) {
    if (now - value.timestamp > CACHE_TTL_MS) {
      idempotencyCache.delete(key);
      removedCount++;
    }
  }

  if (removedCount > 0) {
    logger.info(`🧹 [IDEMPOTENCY] Cleaned up ${removedCount} expired keys`);
  }
}, 60 * 60 * 1000); // Run every hour

/**
 * Idempotency Middleware.
 *
 * Wraps route handlers to make them idempotent.
 * Requires client to send 'Idempotency-Key' header.
 */
const idempotency = (req, res, next) => {
  const idempotencyKey = req.get('Idempotency-Key');

  // If no key provided, skip idempotency (allow normal execution)
  // This is optional - you can make it required by returning 400 instead
  if (!idempotencyKey) {
    return next();
  }

  // Validate key format (must be UUID-like or similar unique identifier)
  if (idempotencyKey.length < 16 || idempotencyKey.length > 128) {
    return res.status(400).json({
      success: false,
      message: 'Invalid Idempotency-Key format. Must be 16-128 characters.'
    });
  }

  // Create a scoped key that includes user context to prevent key reuse across users
  const scopedKey = `${req.session.userId || 'anonymous'}:${idempotencyKey}`;

  // Check if this operation was already completed
  const cached = idempotencyCache.get(scopedKey);

  if (cached) {
    const age = Date.now() - cached.timestamp;

    // If cached response is still valid, return it
    if (age < CACHE_TTL_MS) {
      logger.info({
        reqId: req.correlationId,
        idempotencyKey,
        cacheAge: Math.floor(age / 1000) + 's'
      }, '♻️  [IDEMPOTENCY] Returning cached response');

      res.set('X-Idempotency-Hit', 'true');
      return res.status(cached.statusCode).json(cached.body);
    } else {
      // Expired - remove from cache
      idempotencyCache.delete(scopedKey);
    }
  }

  // Intercept the response to cache it
  const originalJson = res.json.bind(res);

  res.json = function(body) {
    // Only cache successful responses (2xx status codes)
    if (res.statusCode >= 200 && res.statusCode < 300) {
      idempotencyCache.set(scopedKey, {
        statusCode: res.statusCode,
        body,
        timestamp: Date.now()
      });

      logger.info({
        reqId: req.correlationId,
        idempotencyKey,
        statusCode: res.statusCode
      }, '💾 [IDEMPOTENCY] Cached response for future requests');
    }

    return originalJson(body);
  };

  // Proceed with normal execution
  next();
};

/**
 * Get cache statistics (useful for monitoring).
 */
function getCacheStats() {
  const now = Date.now();
  let validEntries = 0;
  let expiredEntries = 0;

  for (const [, value] of idempotencyCache.entries()) {
    if (now - value.timestamp > CACHE_TTL_MS) {
      expiredEntries++;
    } else {
      validEntries++;
    }
  }

  return {
    total: idempotencyCache.size,
    valid: validEntries,
    expired: expiredEntries,
    ttlHours: CACHE_TTL_MS / (60 * 60 * 1000)
  };
}

module.exports = { idempotency, getCacheStats };
