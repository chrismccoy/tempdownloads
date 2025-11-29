/**
 * File Validation Utility.
 */

/**
 * Common Magic Numbers for supported file types.
 * These byte sequences appear at the very beginning of valid files.
 */
const MAGIC_NUMBERS = {
  'jpg': [0xFF, 0xD8, 0xFF],
  'png': [0x89, 0x50, 0x4E, 0x47], // .PNG
  'gif': [0x47, 0x49, 0x46, 0x38], // GIF8
  'pdf': [0x25, 0x50, 0x44, 0x46], // %PDF
  'zip': [0x50, 0x4B, 0x03, 0x04], // PK..
  '7z':  [0x37, 0x7A, 0xBC, 0xAF]  // 7z..
};

/**
 * Validates a buffer against known Magic Numbers.
 */
function validateBuffer(buffer) {
  // Buffer must have at least 4 bytes to check most signatures
  if (!buffer || buffer.length < 4) return null;

  for (const [ext, numbers] of Object.entries(MAGIC_NUMBERS)) {
    let match = true;

    // Check byte-by-byte
    for (let i = 0; i < numbers.length; i++) {
      if (buffer[i] !== numbers[i]) {
        match = false;
        break;
      }
    }

    if (match) return ext;
  }

  return null;
}

module.exports = { validateBuffer };
