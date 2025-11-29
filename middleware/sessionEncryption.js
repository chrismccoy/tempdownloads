/**
 * Session Encryption Middleware.
 *
 * Provides custom session serialization/deserialization with encryption.
 * Encrypts session data before writing to the database store.
 * Decrypts session data when reading from the database store.
 */

const crypto = require('crypto');
const logger = require('../utils/logger');
const config = require('../config');

// Encryption algorithm
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // GCM standard IV length
const AUTH_TAG_LENGTH = 16; // GCM authentication tag length
const SALT_LENGTH = 16; // For key derivation

/**
 * Derives a 256-bit encryption key from the session secret.
 * Uses PBKDF2 with a static salt
 */
function getEncryptionKey() {
  const secret = config.security.sessionSecret;

  if (!secret || secret.length < 32) {
    throw new Error('SESSION_SECRET must be at least 32 characters for session encryption');
  }

  // Use a static salt derived from the secret itself for deterministic key generation
  const staticSalt = crypto.createHash('sha256').update(secret + '_session_encryption').digest();

  // Derive a 256-bit key using PBKDF2
  return crypto.pbkdf2Sync(secret, staticSalt, 100000, 32, 'sha256');
}

/**
 * Encrypts session data.
 */
function encryptSession(session) {
  try {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);

    // Serialize session to JSON
    const plaintext = JSON.stringify(session);

    // Create cipher
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    // Encrypt
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    // Get authentication tag
    const authTag = cipher.getAuthTag();

    // Combine: iv + authTag + encrypted
    // Format: [IV(12 bytes)][AUTH_TAG(16 bytes)][ENCRYPTED_DATA]
    const combined = Buffer.concat([
      iv,
      authTag,
      Buffer.from(encrypted, 'hex')
    ]);

    // Prepend version marker for future compatibility
    return 'v1:' + combined.toString('base64');
  } catch (error) {
    logger.error({ err: error, reqId: 'session_encrypt' }, 'Session encryption failed');
    throw error;
  }
}

/**
 * Decrypts session data.
 */
function decryptSession(encryptedData) {
  try {
    // Check for version marker
    if (!encryptedData.startsWith('v1:')) {
      // Legacy unencrypted session - parse directly
      // This allows graceful migration from unencrypted to encrypted sessions
      logger.warn({ reqId: 'session_decrypt' }, 'Detected unencrypted legacy session - consider session rotation');
      return JSON.parse(encryptedData);
    }

    // Remove version marker and decode
    const combined = Buffer.from(encryptedData.slice(3), 'base64');

    // Extract components
    const iv = combined.subarray(0, IV_LENGTH);
    const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const encrypted = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

    const key = getEncryptionKey();

    // Create decipher
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    // Decrypt
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    // Parse JSON
    return JSON.parse(decrypted);
  } catch (error) {
    // If decryption fails, it could be:
    // 1. Corrupted data
    // 2. Wrong encryption key (server secret changed)
    // 3. Tampered session data
    logger.error({ err: error, reqId: 'session_decrypt' }, 'Session decryption failed - session invalidated');

    // Return empty session to force re-authentication
    return {};
  }
}

/**
 * Custom session serializer for express-session.
 * Encrypts session data before storage and decrypts on retrieval.
 */
const encryptedSessionSerializer = {
  /**
   * Serializes (encrypts) session data for storage.
   */
  stringify: function(session) {
    return encryptSession(session);
  },

  /**
   * Deserializes (decrypts) session data from storage.
   */
  parse: function(sessionData) {
    return decryptSession(sessionData);
  }
};

module.exports = {
  encryptedSessionSerializer,
  encryptSession,
  decryptSession
};
