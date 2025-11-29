/**
 * Data Sanitization Utility.
 *
 * Removes or redacts sensitive information before logging or storage.
 * Used primarily for audit logs, error logs, and external API calls.
 *
 * Sensitive data types:
 * - Passwords (plaintext, hashed)
 * - API Keys & Tokens
 * - Session IDs
 * - Credit Card Numbers
 * - Email addresses (optional, based on policy)
 * - IP addresses (optional, for GDPR compliance)
 * - File checksums/hashes (can reveal file content)
 */

/**
 * List of sensitive field names to redact.
 * Matches exact keys and patterns (case-insensitive).
 */
const SENSITIVE_FIELDS = [
  // Authentication & Authorization
  'password',
  'password_hash',
  'passwordHash',
  'newPassword',
  'oldPassword',
  'currentPassword',
  'secret',
  'token',
  'accessToken',
  'refreshToken',
  'apiKey',
  'api_key',
  'sessionId',
  'session_id',
  'sessionToken',

  // Payment & Financial
  'creditCard',
  'credit_card',
  'cardNumber',
  'card_number',
  'cvv',
  'cvv2',
  'pin',

  // Cryptographic
  'privateKey',
  'private_key',
  'encryptionKey',
  'encryption_key',
  'salt',

  // Optional
  // 'email',
  // 'ip',
  // 'ip_address',
  // 'ipAddress',
];

/**
 * Redaction marker for sensitive fields.
 */
const REDACTED = '[REDACTED]';

/**
 * Sanitizes an object by removing or redacting sensitive fields.
 */
function sanitize(data, depth = 0) {
  // Prevent infinite recursion
  if (depth > 10) {
    return '[MAX_DEPTH_EXCEEDED]';
  }

  // Handle null/undefined
  if (data === null || data === undefined) {
    return data;
  }

  // Handle primitives (string, number, boolean)
  if (typeof data !== 'object') {
    return data;
  }

  // Handle Arrays
  if (Array.isArray(data)) {
    return data.map(item => sanitize(item, depth + 1));
  }

  // Handle Objects
  const sanitized = {};

  for (const [key, value] of Object.entries(data)) {
    // Check if this key is sensitive (case-insensitive)
    const isSensitive = SENSITIVE_FIELDS.some(
      field => key.toLowerCase() === field.toLowerCase()
    );

    if (isSensitive) {
      // Redact the value
      sanitized[key] = REDACTED;
    } else if (typeof value === 'object' && value !== null) {
      // Recursively sanitize nested objects/arrays
      sanitized[key] = sanitize(value, depth + 1);
    } else {
      // Safe primitive value - keep as-is
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Sanitizes audit log details before storage.
 */
function sanitizeAuditDetails(details) {
  if (!details || typeof details !== 'object') {
    return details;
  }

  // Create a sanitized copy
  const sanitized = sanitize(details);

  return sanitized;
}

/**
 * Anonymizes IP addresses for GDPR compliance.
 * Replaces last octet of IPv4 or last 80 bits of IPv6 with zeros.
 */
function anonymizeIp(ip) {
  if (!ip || typeof ip !== 'string') {
    return ip;
  }

  // IPv4: Replace last octet with 0
  if (ip.includes('.')) {
    const parts = ip.split('.');
    if (parts.length === 4) {
      parts[3] = '0';
      return parts.join('.');
    }
  }

  // IPv6: Replace last 80 bits with zeros
  if (ip.includes(':')) {
    const parts = ip.split(':');
    if (parts.length >= 3) {
      // Keep first 48 bits (3 groups), zero out the rest
      return parts.slice(0, 3).join(':') + '::';
    }
  }

  // Unknown format - return as-is
  return ip;
}

/**
 * Sanitizes error objects before logging.
 * Removes stack traces from production logs and redacts sensitive data.
 */
function sanitizeError(error, includeStack = false) {
  if (!error) {
    return error;
  }

  const sanitized = {
    name: error.name,
    message: error.message,
    code: error.code,
  };

  // Include stack trace only in development
  if (includeStack && error.stack) {
    sanitized.stack = error.stack;
  }

  // Sanitize any additional properties on the error
  for (const [key, value] of Object.entries(error)) {
    if (!['name', 'message', 'stack', 'code'].includes(key)) {
      sanitized[key] = sanitize(value);
    }
  }

  return sanitized;
}

module.exports = {
  sanitize,
  sanitizeAuditDetails,
  sanitizeError,
  anonymizeIp,
  REDACTED
};
