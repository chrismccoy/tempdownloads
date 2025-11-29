/**
 * Encryption Utility
 *
 * Handles authenticated encryption using AES-256-GCM.
 * This module is for securing Download Tokens and URLs.
 */

const crypto = require('crypto');
const config = require('../config');

const ALGORITHM = 'aes-256-gcm';

/**
 * Parse and Bufferize Encryption Keys.
 * Supports keys provided as 64-char HEX strings or raw 32-char strings.
 */
const PARSED_KEYS = config.security.encryptionKeys.map(key => {
  if (/^[0-9a-fA-F]+$/.test(key) && key.length === 64) {
    return Buffer.from(key, 'hex');
  }
  // If user manually typed a 32-char string
  return key;
});

// Use the configured IV (must be 16 bytes)
const PARSED_IV = config.security.encryptionIv;

/**
 * Encrypts a JSON payload into a secure token string.
 * Uses the PRIMARY key (Index 0) for all new encryptions.
 *
 * Generates authenticated encryption (AES-256-GCM) to prevent tampering.
 * Returns a colon-separated string containing IV, auth tag, and encrypted data.
 */
function encrypt(payload) {
  const text = JSON.stringify(payload);

  const iv = Buffer.from(PARSED_IV); // Ensure Buffer
  const key = PARSED_KEYS[0]; // Always use the first key for new data

  // Create Cipher
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  // Get Auth Tag (Critical for GCM integrity check)
  const authTag = cipher.getAuthTag().toString('hex');

  // Return the components needed for decryption
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypts a token string back into a JSON object.
 * Implements **Key Rotation**: Tries decrypting with the current key,
 * and if that fails (Auth Tag mismatch), retries with fallback keys.
 *
 * Validates data integrity via GCM auth tag. If decryption fails with all
 * available keys, returns null (indicates tampering or invalid token).
 */
function decrypt(token) {
  try {
    const parts = token.split(':');
    if (parts.length !== 3) return null;

    const [ivHex, authTagHex, encryptedHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    // Iterate through all available keys (Key Rotation logic)
    for (const key of PARSED_KEYS) {
      try {
        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
        decipher.setAuthTag(authTag);

        let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
        decrypted += decipher.final('utf8');

        return JSON.parse(decrypted);
      } catch (error) {
        // If authentication fails (wrong key or tampered data), try the next key
        continue;
      }
    }
  } catch (e) {
    // Malformed token structure
    return null;
  }

  // All keys failed
  return null;
}

module.exports = { encrypt, decrypt };
