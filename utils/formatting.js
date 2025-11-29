/**
 * Data Formatting Utility Module.
 *
 * Provides helper functions to format raw data (bytes, filenames)
 * into human-readable strings for the UI.
 */

/**
 * Formats a raw byte number into a human-readable string (KB, MB, GB).
 */
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  // Example: 1500 / (1024^1) = 1.46 KB
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Extracts the file extension from a filename.
 *
 * Used for displaying file type icons or badges in the UI.
 * Returns extension in uppercase for consistency.
 */
function getFileExtension(filename) {
  if (!filename || typeof filename !== 'string') return 'UNKNOWN';
  return filename.split('.').pop().toUpperCase();
}

module.exports = { formatBytes, getFileExtension };
