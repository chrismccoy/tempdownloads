/**
 * Application Error Classes.
 */

const { ERROR_CODES } = require('../constants');

/**
 * Base Error Class.
 */
class AppError extends Error {
  constructor(message, statusCode, code = ERROR_CODES.INTERNAL_ERROR) {
    super(message);
    this.statusCode = statusCode;
    this.code = code; // Machine-readable error code for clients
    this.isOperational = true; // Marks this error as trusted/known logic flow
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * 404 Not Found Error.
 */
class NotFoundError extends AppError {
  constructor(message = 'Resource not found', code = ERROR_CODES.NOT_FOUND) {
    super(message, 404, code);
  }
}

/**
 * 400 Bad Request Error (Validation Failures).
 */
class ValidationError extends AppError {
  constructor(message = 'Invalid input data', code = ERROR_CODES.VALIDATION_ERROR) {
    super(message, 400, code);
  }
}

/**
 * 401 Authentication Error (Login Failed).
 */
class AuthenticationError extends AppError {
  constructor(message = 'Authentication failed', code = ERROR_CODES.INVALID_CREDENTIALS) {
    super(message, 401, code);
  }
}

module.exports = {
  AppError,
  NotFoundError,
  ValidationError,
  AuthenticationError,
};
