/**
 * Password Hashing Utility.
 *
 * Centralizes password hashing and verification using bcrypt.
 * Provides consistent salt rounds and error handling across the application.
 */

const bcrypt = require('bcrypt');
const logger = require('./logger');

/**
 * Salt rounds for bcrypt hashing.
 * Higher = more secure but slower.
 */
const SALT_ROUNDS = 10;

/**
 * Hashes a plaintext password using bcrypt.
 */
async function hashPassword(password) {
  if (!password || typeof password !== 'string') {
    throw new Error('Password must be a non-empty string');
  }

  if (password.length < 1) {
    throw new Error('Password cannot be empty');
  }

  try {
    return await bcrypt.hash(password, SALT_ROUNDS);
  } catch (error) {
    logger.error({ err: error }, 'Password hashing failed');
    throw new Error('Failed to hash password');
  }
}

/**
 * Verifies a plaintext password against a bcrypt hash.
 */
async function verifyPassword(password, hash) {
  if (!password || !hash) {
    return false;
  }

  try {
    return await bcrypt.compare(password, hash);
  } catch (error) {
    logger.error({ err: error }, 'Password verification failed');
    return false;
  }
}

/**
 * Generates a hash for timing attack mitigation.
 * Used when user doesn't exist to ensure consistent timing.
 */
async function generateDummyHash(seed) {
  return hashPassword(seed);
}

module.exports = {
  hashPassword,
  verifyPassword,
  generateDummyHash,
  SALT_ROUNDS
};
