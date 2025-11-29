/**
 * Password Reset Service
 *
 * Handles password reset token generation, validation, and password updates.
 * Tokens expire after 1 hour for security.
 */

const crypto = require('crypto');
const { AppError, AuthenticationError } = require('../utils/AppError');
const { hashPassword } = require('../utils/passwordHash');
const { ERROR_CODES } = require('../constants');

class PasswordResetService {
  /**
   * Token expiry time in milliseconds (1 hour)
   */
  static TOKEN_EXPIRY_MS = 60 * 60 * 1000;

  /**
   * Creates PasswordResetService with injected dependencies.
   */
  constructor(db, userRepository, logger) {
    this.db = db;
    this.userRepository = userRepository;
    this.logger = logger;
  }

  /**
   * Create a password reset token for the given email address.
   */
  async createToken(email) {
    const user = await this.userRepository.findByEmail(email);
    if (!user) {
      throw new AuthenticationError('User not found', ERROR_CODES.USER_NOT_FOUND);
    }

    // Generate a secure random token (64 characters)
    const token = crypto.randomBytes(32).toString('hex');

    // Hash the token with SHA-256 for storage
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    // Delete any existing tokens for this email
    await this.db('password_reset_tokens')
      .where('email', email)
      .delete();

    // Insert new token
    await this.db('password_reset_tokens').insert({
      email,
      token: hashedToken,
      created_at: Date.now()
    });

    this.logger.info({ email }, 'Password reset token created');

    return {
      token, // Return unhashed token to send to user
      user
    };
  }

  /**
   * Validate a password reset token.
   */
  async validateToken(email, token) {
    // Hash the provided token to compare with stored hash
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const record = await this.db('password_reset_tokens')
      .where('email', email)
      .where('token', hashedToken)
      .first();

    if (!record) {
      return false;
    }

    // Check if token is expired (1 hour)
    const expiryTime = record.created_at + PasswordResetService.TOKEN_EXPIRY_MS;
    if (Date.now() > expiryTime) {
      // Clean up expired token
      await this.deleteToken(email);
      return false;
    }

    return true;
  }

  /**
   * Reset user password using a valid token.
   */
  async resetPassword(email, token, newPassword, newPasswordConfirm) {
    // Validate password confirmation
    if (newPassword !== newPasswordConfirm) {
      throw new AppError('Password confirmation does not match', 400, ERROR_CODES.VALIDATION_ERROR);
    }

    // Validate token first
    const isValid = await this.validateToken(email, token);
    if (!isValid) {
      throw new AuthenticationError('Invalid or expired reset token', ERROR_CODES.INVALID_CREDENTIALS);
    }

    const user = await this.userRepository.findByEmail(email);
    if (!user) {
      throw new AuthenticationError('User not found', ERROR_CODES.USER_NOT_FOUND);
    }

    // Hash the new password
    const passwordHash = await hashPassword(newPassword);

    // Update password
    await this.userRepository.update(user.id, {
      password_hash: passwordHash
    });

    // Delete the used token
    await this.deleteToken(email);

    this.logger.info({ email, userId: user.id }, 'Password reset successful');
  }

  /**
   * Delete a password reset token.
   */
  async deleteToken(email) {
    await this.db('password_reset_tokens')
      .where('email', email)
      .delete();
  }

  /**
   * Clean up expired tokens (run via scheduled task).
   */
  async cleanupExpiredTokens() {
    const expiryThreshold = Date.now() - PasswordResetService.TOKEN_EXPIRY_MS;

    const deleted = await this.db('password_reset_tokens')
      .where('created_at', '<', expiryThreshold)
      .delete();

    if (deleted > 0) {
      this.logger.info({ deleted }, 'Cleaned up expired password reset tokens');
    }

    return deleted;
  }
}

module.exports = PasswordResetService;
