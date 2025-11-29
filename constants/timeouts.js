/**
 * Timeout Constants.
 *
 * Centralized timeout values used across the application.
 * All values are in milliseconds unless otherwise specified.
 */

/**
 * Request timeout for HTTP requests.
 * Prevents attacks and hung requests.
 */
const REQUEST_TIMEOUT_MS = 30000; // 30 seconds

/**
 * Graceful shutdown timeout.
 * Maximum time to wait for requests to complete before forcing shutdown.
 */
const SHUTDOWN_TIMEOUT_MS = 30000; // 30 seconds

/**
 * Job queue shutdown timeout.
 * Maximum time to wait for jobs to complete before forcing job queue shutdown.
 */
const JOB_SHUTDOWN_TIMEOUT_MS = 30000; // 30 seconds

/**
 * Default cache TTL.
 * Time-to-live for cached query results.
 */
const CACHE_TTL_MS = 300000; // 5 minutes

/**
 * Rate limiter window duration.
 * Time window for counting requests in rate limiting.
 */
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Request deduplication window.
 * Time window for considering requests as duplicates.
 */
const DEDUP_WINDOW_MS = 5000; // 5 seconds

/**
 * Idempotency key expiration.
 * How long to cache idempotency keys for duplicate request detection.
 */
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Session cookie max age.
 * Maximum lifetime of a user session.
 */
const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * HSTS max age.
 * How long browsers should remember to use HTTPS.
 */
const HSTS_MAX_AGE_SECONDS = 31536000; // 1 year

/**
 * Garbage collection cleanup interval.
 * How often to run the cleanup job for expired/deleted links.
 */
const CLEANUP_INTERVAL_MS = 3600000; // 1 hour

module.exports = {
  REQUEST_TIMEOUT_MS,
  SHUTDOWN_TIMEOUT_MS,
  JOB_SHUTDOWN_TIMEOUT_MS,
  CACHE_TTL_MS,
  RATE_LIMIT_WINDOW_MS,
  DEDUP_WINDOW_MS,
  IDEMPOTENCY_TTL_MS,
  SESSION_MAX_AGE_MS,
  HSTS_MAX_AGE_SECONDS,
  CLEANUP_INTERVAL_MS,
};
