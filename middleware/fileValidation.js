/**
 * File Validation Middleware.
 *
 * Provides file validation at the controller/route level.
 * Validates files BEFORE they reach storage service for early rejection.
 */

const { LIMITS, ERROR_CODES } = require('../constants');
const { AppError } = require('../utils/AppError');
const logger = require('../utils/logger');

/**
 * Allowed MIME types for file uploads.
 * Matches the configuration in multer file filter.
 */
const ALLOWED_MIME_TYPES = new Set([
  'application/zip',
  'application/x-zip-compressed',
  'application/x-7z-compressed',
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp'
]);

/**
 * Allowed file extensions (without dot).
 */
const ALLOWED_EXTENSIONS = new Set([
  'zip',
  '7z',
  'pdf',
  'jpg',
  'jpeg',
  'png',
  'gif',
  'webp'
]);

/**
 * Validates file metadata before upload.
 * Checks file size and MIME type from request body.
 */
function validateFileMetadata(req, res, next) {
  const { filename, filesize, mimetype } = req.body;

  try {
    // Validate filename exists
    if (!filename || typeof filename !== 'string') {
      throw new AppError('Filename is required', 400, ERROR_CODES.VALIDATION_ERROR);
    }

    // Validate file size if provided
    if (filesize !== undefined && filesize !== null) {
      const size = parseInt(filesize, 10);

      if (isNaN(size) || size < 0) {
        throw new AppError('Invalid file size', 400, ERROR_CODES.VALIDATION_ERROR);
      }

      if (size > LIMITS.MAX_FILE_SIZE_BYTES) {
        throw new AppError(
          `File size ${(size / 1024 / 1024).toFixed(2)}MB exceeds maximum ${LIMITS.MAX_FILE_SIZE_MB}MB`,
          413,
          ERROR_CODES.FILE_TOO_LARGE
        );
      }
    }

    // Validate MIME type if provided
    if (mimetype && typeof mimetype === 'string') {
      const normalizedMime = mimetype.toLowerCase().trim();

      if (!ALLOWED_MIME_TYPES.has(normalizedMime)) {
        throw new AppError(
          `File type '${mimetype}' not allowed. Allowed types: zip, 7z, pdf, jpg, png, gif, webp`,
          400,
          ERROR_CODES.INVALID_FILE_TYPE
        );
      }
    }

    // Validate file extension
    const extension = filename.split('.').pop()?.toLowerCase();
    if (!extension || !ALLOWED_EXTENSIONS.has(extension)) {
      throw new AppError(
        `File extension '.${extension}' not allowed. Allowed: ${Array.from(ALLOWED_EXTENSIONS).join(', ')}`,
        400,
        ERROR_CODES.INVALID_FILE_TYPE
      );
    }

    // Log validation success
    logger.info({
      reqId: req.correlationId,
      filename,
      filesize,
      mimetype
    }, 'File metadata validation passed');

    next();
  } catch (error) {
    // Log validation failure
    logger.warn({
      reqId: req.correlationId,
      filename,
      filesize,
      mimetype,
      err: error.message
    }, 'File metadata validation failed');

    next(error);
  }
}

/**
 * Validates uploaded file from multer.
 * Checks file object properties after multer processing.
 */
function validateUploadedFile(req, res, next) {
  try {
    // Check if file exists
    if (!req.file) {
      throw new AppError('No file uploaded', 400, ERROR_CODES.VALIDATION_ERROR);
    }

    const { originalname, mimetype, size } = req.file;

    // Validate file size
    if (size > LIMITS.MAX_FILE_SIZE_BYTES) {
      throw new AppError(
        `File size ${(size / 1024 / 1024).toFixed(2)}MB exceeds maximum ${LIMITS.MAX_FILE_SIZE_MB}MB`,
        413,
        ERROR_CODES.FILE_TOO_LARGE
      );
    }

    // Validate MIME type
    const normalizedMime = mimetype.toLowerCase().trim();
    if (!ALLOWED_MIME_TYPES.has(normalizedMime)) {
      throw new AppError(
        `File type '${mimetype}' not allowed`,
        400,
        ERROR_CODES.INVALID_FILE_TYPE
      );
    }

    // Validate file extension
    const extension = originalname.split('.').pop()?.toLowerCase();
    if (!extension || !ALLOWED_EXTENSIONS.has(extension)) {
      throw new AppError(
        `File extension '.${extension}' not allowed`,
        400,
        ERROR_CODES.INVALID_FILE_TYPE
      );
    }

    logger.info({
      reqId: req.correlationId,
      filename: originalname,
      size,
      mimetype
    }, 'Uploaded file validation passed');

    next();
  } catch (error) {
    logger.warn({
      reqId: req.correlationId,
      file: req.file,
      err: error.message
    }, 'Uploaded file validation failed');

    // Clean up uploaded file if validation fails
    if (req.file && req.file.path) {
      const fs = require('fs');
      fs.unlink(req.file.path, (unlinkErr) => {
        if (unlinkErr) {
          logger.error({ err: unlinkErr }, 'Failed to clean up invalid uploaded file');
        }
      });
    }

    next(error);
  }
}

/**
 * Validates file extension matches MIME type.
 * Prevents attacks where extension doesn't match actual file type.
 */
function extensionMatchesMimeType(filename, mimetype) {
  const extension = filename.split('.').pop()?.toLowerCase();
  const normalizedMime = mimetype.toLowerCase().trim();

  const extensionToMime = {
    'zip': ['application/zip', 'application/x-zip-compressed'],
    '7z': ['application/x-7z-compressed'],
    'pdf': ['application/pdf'],
    'jpg': ['image/jpeg', 'image/jpg'],
    'jpeg': ['image/jpeg', 'image/jpg'],
    'png': ['image/png'],
    'gif': ['image/gif'],
    'webp': ['image/webp']
  };

  const expectedMimes = extensionToMime[extension];
  if (!expectedMimes) {
    return false;
  }

  return expectedMimes.includes(normalizedMime);
}

/**
 * Strict validation middleware that enforces extension/MIME matching.
 */
function validateFileConsistency(req, res, next) {
  try {
    const { filename, mimetype } = req.body;

    if (!filename || !mimetype) {
      // If either is missing, let other validators handle it
      return next();
    }

    if (!extensionMatchesMimeType(filename, mimetype)) {
      throw new AppError(
        'File extension does not match MIME type (potential file type mismatch)',
        400,
        ERROR_CODES.INVALID_FILE_TYPE
      );
    }

    next();
  } catch (error) {
    logger.warn({
      reqId: req.correlationId,
      filename: req.body?.filename,
      mimetype: req.body?.mimetype,
      err: error.message
    }, 'File consistency validation failed');

    next(error);
  }
}

module.exports = {
  validateFileMetadata,
  validateUploadedFile,
  validateFileConsistency,
  ALLOWED_MIME_TYPES,
  ALLOWED_EXTENSIONS
};
