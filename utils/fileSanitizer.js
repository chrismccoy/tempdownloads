/**
 * File Sanitization Utility.
 *
 * Provides functions for sanitizing filenames and file-related data.
 */

const path = require('path');

/**
 * Maximum filename length (most filesystems support 255).
 */
const MAX_FILENAME_LENGTH = 200;

/**
 * Sanitizes a filename for safe storage.
 * Removes dangerous characters while preserving readability.
 */
function sanitizeFilename(filename, options = {}) {
  const {
    preserveExtension = true,
    replacement = '_'
  } = options;

  if (!filename || typeof filename !== 'string') {
    return 'unnamed_file';
  }

  // Remove null bytes (can bypass security checks)
  let sanitized = filename.replace(/\0/g, '');

  // Remove or replace path separators
  sanitized = sanitized.replace(/[\/\\]/g, replacement);

  // Remove or replace dangerous characters
  // Allows: alphanumeric, dash, underscore, dot, space
  // Replaces: everything else (including shell metacharacters)
  sanitized = sanitized.replace(/[^a-zA-Z0-9._\- ]/g, replacement);

  // Replace multiple consecutive replacements with single
  const escapedReplacement = replacement.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const multiplePattern = new RegExp(`${escapedReplacement}{2,}`, 'g');
  sanitized = sanitized.replace(multiplePattern, replacement);

  // Trim whitespace and replacement characters from edges
  sanitized = sanitized.trim().replace(/^[_\-]+|[_\-]+$/g, '');

  // Handle extension preservation
  if (preserveExtension) {
    const ext = path.extname(sanitized);
    const basename = path.basename(sanitized, ext);

    // Truncate basename if too long
    const maxBasenameLength = MAX_FILENAME_LENGTH - ext.length;
    const truncatedBasename = basename.substring(0, maxBasenameLength);

    sanitized = truncatedBasename + ext;
  } else {
    // Truncate entire filename
    sanitized = sanitized.substring(0, MAX_FILENAME_LENGTH);
  }

  // Fallback if sanitization resulted in empty string
  if (!sanitized || sanitized.length === 0) {
    sanitized = 'unnamed_file';
  }

  return sanitized;
}

/**
 * Generates a unique storage key for a file.
 * Combines timestamp, UUID, and sanitized original filename.
 */
function generateStorageKey(originalFilename, options = {}) {
  const { v4: uuidv4 } = require('uuid');
  const { prefix = '' } = options;

  const sanitized = sanitizeFilename(originalFilename);
  const timestamp = Date.now();
  const uuid = uuidv4();

  const parts = [timestamp, uuid, sanitized];
  if (prefix) {
    parts.unshift(prefix);
  }

  return parts.join('-');
}

/**
 * Validates a filename for common security issues.
 * Returns an error message if invalid, null if valid.
 */
function validateFilename(filename) {
  if (!filename || typeof filename !== 'string') {
    return 'Filename is required';
  }

  if (filename.length === 0) {
    return 'Filename cannot be empty';
  }

  if (filename.length > MAX_FILENAME_LENGTH) {
    return `Filename exceeds maximum length of ${MAX_FILENAME_LENGTH} characters`;
  }

  // Check for null bytes
  if (filename.includes('\0')) {
    return 'Filename contains invalid null bytes';
  }

  // Check for path traversal
  if (filename.includes('..')) {
    return 'Filename contains path traversal sequences';
  }

  // Check for absolute paths
  if (filename.startsWith('/') || filename.startsWith('\\')) {
    return 'Filename cannot be an absolute path';
  }

  // Check for Windows reserved names
  const windowsReserved = ['CON', 'PRN', 'AUX', 'NUL', 'COM1', 'COM2', 'COM3', 'COM4',
    'COM5', 'COM6', 'COM7', 'COM8', 'COM9', 'LPT1', 'LPT2', 'LPT3', 'LPT4',
    'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'];

  const basenameLower = path.basename(filename, path.extname(filename)).toUpperCase();
  if (windowsReserved.includes(basenameLower)) {
    return 'Filename uses a reserved system name';
  }

  return null; // Valid
}

/**
 * Sanitizes a file path to prevent directory traversal.
 * Only allows relative paths within a safe directory.
 */
function sanitizeFilePath(filePath, baseDir) {
  // Resolve the path to prevent traversal
  const resolved = path.resolve(baseDir, filePath);

  // Ensure the resolved path is within the base directory
  if (!resolved.startsWith(path.resolve(baseDir))) {
    throw new Error('Path traversal detected');
  }

  return resolved;
}

module.exports = {
  sanitizeFilename,
  generateStorageKey,
  validateFilename,
  sanitizeFilePath,
  MAX_FILENAME_LENGTH
};
