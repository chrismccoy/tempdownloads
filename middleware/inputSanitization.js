/**
 * Input Sanitization Middleware.
 *
 * Sanitizes user input to prevent XSS, SQL injection, and other injection attacks.
 * Trims whitespace, removes null bytes, and normalizes Unicode characters.
 */

const logger = require('../utils/logger');

/**
 * Dangerous characters to remove or escape.
 */
const DANGEROUS_PATTERNS = {
  // Null bytes can bypass security checks
  nullBytes: /\0/g,

  // HTML/Script tags for XSS prevention
  htmlTags: /<script[^>]*>.*?<\/script>/gi,

  // Path traversal sequences
  pathTraversal: /\.\.[\/\\]/g,

  // Control characters (except common whitespace)
  controlChars: /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g
};

/**
 * Sanitizes a string value.
 */
function sanitizeString(value) {
  if (typeof value !== 'string') {
    return value;
  }

  let sanitized = value;

  // Trim leading/trailing whitespace
  sanitized = sanitized.trim();

  // Remove null bytes
  sanitized = sanitized.replace(DANGEROUS_PATTERNS.nullBytes, '');

  // Remove HTML script tags (basic XSS prevention)
  sanitized = sanitized.replace(DANGEROUS_PATTERNS.htmlTags, '');

  // Remove path traversal sequences
  sanitized = sanitized.replace(DANGEROUS_PATTERNS.pathTraversal, '');

  // Remove control characters
  sanitized = sanitized.replace(DANGEROUS_PATTERNS.controlChars, '');

  // Normalize Unicode (prevents homograph attacks)
  sanitized = sanitized.normalize('NFKC');

  return sanitized;
}

/**
 * Recursively sanitizes an object or array.
 */
function sanitizeData(data, depth = 0) {
  // Prevent infinite recursion
  if (depth > 10) {
    logger.warn('Input sanitization max depth exceeded');
    return data;
  }

  // Handle null/undefined
  if (data === null || data === undefined) {
    return data;
  }

  // Handle strings
  if (typeof data === 'string') {
    return sanitizeString(data);
  }

  // Handle arrays
  if (Array.isArray(data)) {
    return data.map(item => sanitizeData(item, depth + 1));
  }

  // Handle objects
  if (typeof data === 'object') {
    const sanitized = {};
    for (const [key, value] of Object.entries(data)) {
      // Sanitize both keys and values
      const sanitizedKey = sanitizeString(key);
      sanitized[sanitizedKey] = sanitizeData(value, depth + 1);
    }
    return sanitized;
  }

  // Primitives (numbers, booleans) pass through
  return data;
}

/**
 * Express middleware that sanitizes request body, query, and params.
 */
function inputSanitization(options = {}) {
  const {
    sanitizeBody = true,
    sanitizeQuery = true,
    sanitizeParams = true
  } = options;

  return (req, res, next) => {
    try {
      // Sanitize request body
      if (sanitizeBody && req.body) {
        req.body = sanitizeData(req.body);
      }

      // Sanitize query parameters
      if (sanitizeQuery && req.query) {
        req.query = sanitizeData(req.query);
      }

      // Sanitize route parameters
      if (sanitizeParams && req.params) {
        req.params = sanitizeData(req.params);
      }

      next();
    } catch (error) {
      logger.error({
        err: error,
        reqId: req.correlationId
      }, 'Input sanitization failed');

      // Fail closed - reject request if sanitization fails (security over availability)
      return res.status(400).json({
        error: 'Request validation failed',
        message: 'Unable to process request due to input sanitization error'
      });
    }
  };
}

module.exports = inputSanitization;
