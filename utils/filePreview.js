/**
 * File Preview Utility
 *
 * Determines if a file can be previewed in the browser
 * and provides the appropriate preview type.
 */

const path = require('path');

/**
 * File types that can be previewed in the browser.
 */
const PREVIEWABLE_TYPES = {
  // Images
  image: {
    extensions: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg', '.ico'],
    mimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp', 'image/svg+xml', 'image/x-icon'],
    previewType: 'image'
  },

  // PDF Documents
  pdf: {
    extensions: ['.pdf'],
    mimeTypes: ['application/pdf'],
    previewType: 'pdf'
  },

  // Text Files
  text: {
    extensions: ['.txt', '.md', '.log', '.csv', '.json', '.xml', '.html', '.css', '.js', '.ts', '.jsx', '.tsx', '.vue', '.yaml', '.yml', '.ini', '.conf', '.sh', '.bat'],
    mimeTypes: ['text/plain', 'text/markdown', 'text/csv', 'application/json', 'text/xml', 'text/html', 'text/css', 'application/javascript', 'text/x-yaml'],
    previewType: 'text',
    maxSize: 5 * 1024 * 1024 // 5MB max for text preview
  },

  // Video Files
  video: {
    extensions: ['.mp4', '.webm', '.ogg', '.mov'],
    mimeTypes: ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime'],
    previewType: 'video',
    maxSize: 100 * 1024 * 1024 // 100MB max for video preview
  },

  // Audio Files
  audio: {
    extensions: ['.mp3', '.wav', '.ogg', '.m4a', '.aac'],
    mimeTypes: ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4', 'audio/aac'],
    previewType: 'audio'
  }
};

/**
 * Check if a file can be previewed based on filename and size.
 */
function canPreview(filename, fileSize = null) {
  const ext = path.extname(filename).toLowerCase();

  // Check each category
  for (const [category, config] of Object.entries(PREVIEWABLE_TYPES)) {
    if (config.extensions.includes(ext)) {
      // Check size limits if specified
      if (config.maxSize && fileSize && fileSize > config.maxSize) {
        return {
          canPreview: false,
          previewType: null,
          reason: `File too large for preview (max ${formatBytes(config.maxSize)})`
        };
      }

      return {
        canPreview: true,
        previewType: config.previewType,
        reason: null
      };
    }
  }

  return {
    canPreview: false,
    previewType: null,
    reason: 'File type not supported for preview'
  };
}

/**
 * Get MIME type from filename extension.
 */
function getMimeType(filename) {
  const ext = path.extname(filename).toLowerCase();

  // Check each category for matching extension
  for (const config of Object.values(PREVIEWABLE_TYPES)) {
    const index = config.extensions.indexOf(ext);
    if (index !== -1 && config.mimeTypes[index]) {
      return config.mimeTypes[index];
    }
  }

  // Common fallbacks not in preview list
  const commonMimeTypes = {
    '.zip': 'application/zip',
    '.rar': 'application/x-rar-compressed',
    '.7z': 'application/x-7z-compressed',
    '.tar': 'application/x-tar',
    '.gz': 'application/gzip',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.ppt': 'application/vnd.ms-powerpoint',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  };

  return commonMimeTypes[ext] || 'application/octet-stream';
}

/**
 * Format bytes to human-readable string.
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Get content type header for streaming.
 */
function getContentHeaders(filename, isPreview = false) {
  const mimeType = getMimeType(filename);
  const disposition = isPreview ? 'inline' : 'attachment';

  return {
    'Content-Type': mimeType,
    'Content-Disposition': `${disposition}; filename="${encodeURIComponent(filename)}"`
  };
}

module.exports = {
  canPreview,
  getMimeType,
  getContentHeaders,
  formatBytes,
  PREVIEWABLE_TYPES
};
