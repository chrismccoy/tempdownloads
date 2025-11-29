/**
 * Error Handling Middleware
 */

const logger = require('../utils/logger');
const { AppError } = require('../utils/AppError');
const ApiResponse = require('../utils/apiResponse');
const { ERROR_CODES } = require('../constants');

/**
 * Middleware for handling 404 Not Found errors.
 */
function notFoundHandler(req, res, next) {
  // Create a standardized 404 error and pass it to the global handler
  const error = new AppError('The requested resource could not be found.', 404, ERROR_CODES.NOT_FOUND);
  next(error);
}

/**
 * Global Error Handler Middleware.
 */
function globalErrorHandler(err, req, res, next) {
  // Set default values if error properties are missing
  let statusCode = err.statusCode || 500;
  let message = err.isOperational ? err.message : 'An internal server error occurred.';

  // Handle CSRF Validation Errors (from csrf-csrf)
  if (err.code === 'EBADCSRFTOKEN') {
    statusCode = 403;
    message = 'Session has expired or form token is invalid. Please refresh.';
    err.code = ERROR_CODES.INVALID_CSRF_TOKEN;
  }

  // Handle Decryption Failures (e.g., wrong password or corrupted file)
  if (message.includes('Unsupported state') || message.includes('authenticate data')) {
    statusCode = 422; // Unprocessable Entity
    message = 'File integrity check failed. The file may be corrupted or password is incorrect.';
  }

  // Log 500 errors as ERROR (requires attention)
  if (statusCode >= 500) {
    logger.error({ err, url: req.originalUrl, reqId: req.correlationId, stack: err.stack }, 'Internal Server Error');
  }
  // Log client errors (400-499) as WARN (operational)
  else {
    logger.warn({ err: err.message, url: req.originalUrl, reqId: req.correlationId }, 'Client/Operational Error');
  }

  // JSON Response (for API calls / AJAX)
  if (req.xhr || req.headers.accept?.includes('application/json')) {
    // Use standardized error response format
    const errorCode = err.code || (statusCode >= 500 ? ERROR_CODES.INTERNAL_ERROR : ERROR_CODES.VALIDATION_ERROR);

    return ApiResponse.error(res, message, statusCode, {
      code: errorCode,
      details: err.details || null,
      stack: err.stack
    });
  }

  // HTML Response (for Browser)
  res.locals.currentPath = res.locals.currentPath || req.path || '';
  res.locals.user = res.locals.user || null;

  // Safe CSRF token injection
  if (!res.locals.csrfToken) {
    try {
      // Attempt to generate a fresh token if session is valid
      res.locals.csrfToken = req.csrfToken ? req.csrfToken() : '';
    } catch (e) {
      // Fallback if session is destroyed/invalid
      res.locals.csrfToken = '';
    }
  }

  // Render the dedicated error page
  res.status(statusCode).render('public/error', {
    statusCode,
    title: err.name || 'Error',
    message
  });
}

module.exports = { notFoundHandler, globalErrorHandler };
