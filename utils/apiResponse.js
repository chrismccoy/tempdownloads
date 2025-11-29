/**
 * API Response Utility.
 *
 * Standardizes the JSON structure for all API responses across the application.
 */

class ApiResponse {
  /**
   * Sends a standardized JSON success response.
   */
  static success(res, message, data = {}, statusCode = 200, meta = null) {
    const payload = {
      success: true,
      message,
      data
    };

    // Add metadata if provided (e.g., pagination, correlation ID)
    if (meta) {
      payload.meta = meta;
    }

    // Add request ID for tracing if available
    if (res.req?.correlationId) {
      payload.meta = payload.meta || {};
      payload.meta.requestId = res.req.correlationId;
    }

    return res.status(statusCode).json(payload);
  }

  /**
   * Sends a standardized JSON error response.
   */
  static error(res, message, statusCode = 500, options = {}) {
    const {
      code = null,
      details = null,
      stack = null
    } = options;

    const payload = {
      success: false,
      error: {
        message
      }
    };

    // Add error code if provided
    if (code) {
      payload.error.code = code;
    }

    // Add error details if provided (e.g., validation errors)
    if (details) {
      payload.error.details = details;
    }

    // Add stack trace only in development
    if (stack && process.env.NODE_ENV !== 'production') {
      payload.error.stack = stack;
    }

    // Add metadata
    payload.meta = {
      timestamp: new Date().toISOString(),
      statusCode
    };

    // Add request ID for tracing if available
    if (res.req?.correlationId) {
      payload.meta.requestId = res.req.correlationId;
    }

    return res.status(statusCode).json(payload);
  }

  /**
   * Sends a validation error response.
   */
  static validationError(res, errors) {
    // In production, only send generic validation error to avoid exposing schema
    const details = process.env.NODE_ENV === 'production'
      ? undefined
      : (Array.isArray(errors) ? errors : [errors]);

    return this.error(res, 'Validation failed', 400, {
      code: 'VALIDATION_ERROR',
      details
    });
  }

  /**
   * Sends an unauthorized error response.
   */
  static unauthorized(res, message = 'Unauthorized') {
    return this.error(res, message, 401, {
      code: 'UNAUTHORIZED'
    });
  }

  /**
   * Sends a forbidden error response.
   */
  static forbidden(res, message = 'Forbidden') {
    return this.error(res, message, 403, {
      code: 'FORBIDDEN'
    });
  }

  /**
   * Sends a not found error response.
   */
  static notFound(res, message = 'Resource not found') {
    return this.error(res, message, 404, {
      code: 'NOT_FOUND'
    });
  }

  /**
   * Sends a conflict error response.
   */
  static conflict(res, message) {
    return this.error(res, message, 409, {
      code: 'CONFLICT'
    });
  }

  /**
   * Sends a rate limit error response.
   */
  static tooManyRequests(res, message = 'Too many requests') {
    return this.error(res, message, 429, {
      code: 'RATE_LIMIT_EXCEEDED'
    });
  }

  /**
   * Sends a server error response.
   */
  static serverError(res, message = 'Internal server error', error = null) {
    return this.error(res, message, 500, {
      code: 'INTERNAL_ERROR',
      stack: error?.stack
    });
  }
}

module.exports = ApiResponse;
