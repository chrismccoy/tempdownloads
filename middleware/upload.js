/**
 * File Upload Middleware.
 */

const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { generateStorageKey } = require('../utils/fileSanitizer');

/**
 * Generates a unique, sanitized filename for uploaded files.
 */
const generateKey = (file) => {
  return generateStorageKey(file.originalname);
};

/**
 * Configures the Multer Disk Storage Engine.
 */
function getStorageEngine() {
  const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');

  // Synchronously create the directory if it doesn't exist
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }

  return multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => cb(null, generateKey(file)),
  });
}

/**
 * Allowed MIME types for file uploads.
 * Using Set for O(1) lookup performance (vs Array O(n)).
 *
 * Accepts: ZIP, 7Z, PDF, JPG, PNG, GIF.
 * Rejects executables and scripts to prevent malicious uploads.
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
 * File Filter Function.
 *
 * Validates incoming files based on MIME type.
 * Optimized for performance using Set lookup.
 */
const fileFilter = (req, file, cb) => {
  // Normalize MIME type to lowercase for consistent matching
  const mimetype = file.mimetype.toLowerCase();

  if (ALLOWED_MIME_TYPES.has(mimetype)) {
    // Accept file
    cb(null, true);
  } else {
    // Reject file with descriptive error
    const error = new Error(
      `Invalid file type '${file.mimetype}'. Allowed types: zip, 7z, pdf, jpg, png, gif, webp`
    );
    error.code = 'INVALID_FILE_TYPE';
    cb(error, false);
  }
};

/**
 * Multer Instance.
 * Configured with storage engine, filters, and a 500MB file size limit.
 */
const upload = multer({
  storage: getStorageEngine(),
  fileFilter,
  limits: { fileSize: 1024 * 1024 * 500 }, // 500MB Limit
});

module.exports = upload;
