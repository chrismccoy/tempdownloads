/**
 * Validation Middleware.
 *
 * A generic middleware that uses Zod schemas to validate
 * incoming request data (body, params, query).
 */

const { ZodError } = require('zod');
const logger = require('../utils/logger');
const ApiResponse = require('../utils/apiResponse');

/**
 * Creates a middleware function that validates request properties against provided schemas.
 */
const validate = (schemas) => (req, res, next) => {
  try {

    if (schemas.params) {
      req.params = schemas.params.parse(req.params);
    }

    if (schemas.body) {
      req.body = schemas.body.parse(req.body);
    }

    if (schemas.query) {
      req.query = schemas.query.parse(req.query);
    }

    // Validation successful, proceed to the next middleware/controller
    next();

  } catch (error) {
    let message = 'Invalid input.';
    let validationErrors = null;

    // If it's a Zod validation error, extract specific field messages
    if (error instanceof ZodError) {
      // Extract structured validation errors
      validationErrors = error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
        code: issue.code
      }));

      // Join all error messages into a single string for simplicity
      message = error.issues.map((i) => i.message).join('. ');

      // Log validation failure with structured data
      const logData = {
        reqId: req.correlationId,
        path: req.path,
        method: req.method,
        ip: req.ip,
        userId: req.session?.userId || 'anonymous',
        validationErrors
      };

      // Only include request data in development environment
      // In production, avoid logging request details that could expose schema structure
      if (process.env.NODE_ENV !== 'production') {
        logData.requestData = {
          params: req.params,
          query: req.query,
          bodyKeys: req.body ? Object.keys(req.body) : []
        };
      }

      logger.warn(logData, '⚠️  [VALIDATION] Request validation failed');
    } else {
      // Non-Zod validation error
      logger.error({
        reqId: req.correlationId,
        path: req.path,
        err: error
      }, 'Unexpected validation error');
    }

    // API/AJAX Response (JSON)
    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return ApiResponse.validationError(res, validationErrors || message);
    }

    // Browser Response (HTML)
    return res.status(400).render('public/error', {
        statusCode: 400,
        title: 'Validation Error',
        message
    });
  }
};

module.exports = validate;
