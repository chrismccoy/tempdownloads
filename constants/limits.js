/**
 * Limit Constants.
 *
 * Centralized limit values for file sizes, request counts, and other constraints.
 */

/**
 * Maximum file upload size.
 * Enforced at multiple layers (Multer, schema validation, frontend).
 */
const MAX_FILE_SIZE_BYTES = 500 * 1024 * 1024; // 500MB

/**
 * Maximum file upload size in MB (for display).
 */
const MAX_FILE_SIZE_MB = 500;

/**
 * Maximum filename length.
 * Conservative limit to account for filesystem constraints.
 */
const MAX_FILENAME_LENGTH = 200;

/**
 * Request body size limit.
 * Prevents DOS attacks via large payloads.
 */
const REQUEST_BODY_SIZE_LIMIT = '100kb';

/**
 * Rate limit for global requests.
 * Maximum requests per window from a single IP.
 */
const GLOBAL_RATE_LIMIT_MAX = 100; // requests per window

/**
 * Rate limit for login attempts.
 * Prevents brute force attacks.
 */
const LOGIN_RATE_LIMIT_MAX = 5; // attempts per 15 minutes

/**
 * Rate limit for link password verification.
 * Prevents brute force on password-protected links.
 */
const LINK_PASSWORD_RATE_LIMIT_MAX = 5; // attempts per 15 minutes per link+IP

/**
 * Rate limit for file downloads.
 * Prevents abuse and bandwidth exhaustion.
 */
const DOWNLOAD_RATE_LIMIT_MAX = 10; // downloads per 5 minutes

/**
 * Batch size for garbage collection operations.
 * Number of items to process in each batch.
 */
const GARBAGE_COLLECTION_BATCH_SIZE = 100;

/**
 * Maximum items per garbage collection run.
 * Prevents long-running cleanup operations.
 */
const GARBAGE_COLLECTION_MAX_ITEMS = 1000;

/**
 * Maximum query cache entries.
 * Prevents unlimited memory growth.
 */
const MAX_CACHE_ENTRIES = 1000;

/**
 * Maximum depth for input sanitization recursion.
 * Prevents stack overflow on deeply nested objects.
 */
const MAX_SANITIZATION_DEPTH = 10;

/**
 * Bcrypt salt rounds.
 * Higher = more secure but slower.
 * 10 rounds = ~100ms per hash (recommended for 2024).
 */
const BCRYPT_SALT_ROUNDS = 10;

/**
 * Password minimum length.
 */
const PASSWORD_MIN_LENGTH = 8;

/**
 * Username constraints.
 */
const USERNAME_MIN_LENGTH = 3;
const USERNAME_MAX_LENGTH = 50;

module.exports = {
  MAX_FILE_SIZE_BYTES,
  MAX_FILE_SIZE_MB,
  MAX_FILENAME_LENGTH,
  REQUEST_BODY_SIZE_LIMIT,
  GLOBAL_RATE_LIMIT_MAX,
  LOGIN_RATE_LIMIT_MAX,
  LINK_PASSWORD_RATE_LIMIT_MAX,
  DOWNLOAD_RATE_LIMIT_MAX,
  GARBAGE_COLLECTION_BATCH_SIZE,
  GARBAGE_COLLECTION_MAX_ITEMS,
  MAX_CACHE_ENTRIES,
  MAX_SANITIZATION_DEPTH,
  BCRYPT_SALT_ROUNDS,
  PASSWORD_MIN_LENGTH,
  USERNAME_MIN_LENGTH,
  USERNAME_MAX_LENGTH,
};
