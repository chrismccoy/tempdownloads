/**
 * Local Filesystem Storage Strategy.
 *
 * Features:
 * - Magic Number Validation (File Signature checking)
 * - SHA-256 Checksum Calculation (during upload)
 * - AES-256-GCM Encryption At Rest
 *
 * File Format on Disk:
 * [IV (16 bytes)] + [Ciphertext (...)] + [AuthTag (16 bytes)]
 */

const fs = require('fs');
const fsPromises = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { pipeline } = require('stream/promises');
const { Transform, Readable } = require('stream');
const config = require('../../config');
const { validateBuffer } = require('../../utils/fileValidation');
const StorageStrategy = require('./StorageStrategy');

class LocalStorageStrategy extends StorageStrategy {

  /**
   * Initializes the Local Storage.
   * Creates the upload directory if it doesn't exist and parses encryption keys.
   */
  constructor() {
    super();
    this.uploadDir = path.join(__dirname, '../..', 'uploads');

    // Ensure upload directory exists synchronously at startup
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }

    // Encryption settings
    this.algorithm = 'aes-256-gcm';
    this.key = this._parseKey(config.security.encryptionKeys[0]);
    this.ivLength = 16;
    this.tagLength = 16;
  }

  /**
   * Parses the encryption key.
   * Handles hex strings (64 chars) or raw passphrase strings (pads/truncates to 32 bytes).
   */
  _parseKey(key) {
    return (Buffer.isBuffer(key)) ? key : (
      (key.length === 64) ? Buffer.from(key, 'hex') : Buffer.from(key.padEnd(32).slice(0, 32))
    );
  }

  /**
   * Saves a stream locally while performing validation, hashing, and encryption.
   */
  async saveLocalStream(inputStream, filename, mimeType) {
    const filePath = path.join(this.uploadDir, filename);
    const hash = crypto.createHash('sha256');
    const iv = crypto.randomBytes(this.ivLength);
    const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);

    // Validation
    let isValidated = false;
    let magicBuffer = Buffer.alloc(0);
    const MAGIC_CHECK_SIZE = 4;
    let validationError = null;

    const validator = new Transform({
      transform(chunk, encoding, callback) {
        // Update Checksum calculation on raw data
        hash.update(chunk);

        // Check Magic Bytes
        if (!isValidated) {
          magicBuffer = Buffer.concat([magicBuffer, chunk]);
          if (magicBuffer.length >= MAGIC_CHECK_SIZE) {
              const ext = validateBuffer(magicBuffer);
              // Enforce strict magic byte validation for ALL files (no text/plain bypass)
              if (!ext) {
                validationError = new Error('Invalid file signature (Magic Byte Mismatch). Only supported file types are allowed.');
                return callback(validationError);
              }
              isValidated = true;
          }
        }
        callback(null, chunk);
      }
    });

    // IV + Content + Tag
    let ivPushed = false;
    const containerizer = new Transform({
      transform(chunk, encoding, callback) {
        // Write IV before the first chunk of ciphertext
        if (!ivPushed) {
          this.push(iv);
          ivPushed = true;
        }
        callback(null, chunk); // Write Ciphertext
      },
      flush(callback) {
        // Edge case: Empty file might skip transform hook
        if (!ivPushed) {
          this.push(iv);
          ivPushed = true;
        }

        // Encryption complete, retrieve tag and append as footer
        const tag = cipher.getAuthTag();
        this.push(tag);
        callback();
      }
    });

    try {
      await pipeline(
        inputStream,
        validator,
        cipher,
        containerizer,
        fs.createWriteStream(filePath)
      );

      return {
        checksum: hash.digest('hex'),
        isEncrypted: true
      };
    } catch (err) {
      // Clean up partial file on failure
      await this.delete(filename);
      throw validationError || err;
    }
  }

  /**
   * Deletes a file from the local filesystem.
   */
  async delete(filename) {
    try {
      await fsPromises.unlink(path.join(this.uploadDir, filename));
      return true;
    } catch (error) {
      // Ignore if file doesn't exist
      if (error.code !== 'ENOENT') return false;
      return false;
    }
  }

  /**
   * Gets filesystem stats for the file.
   */
  async getStats(filename) {
    const stats = await fsPromises.stat(path.join(this.uploadDir, filename));
    return { size: stats.size };
  }

  /**
   * Decrypts stream on the fly.
   * 1. Read IV (First 16 bytes).
   * 2. Read AuthTag (Last 16 bytes).
   * 3. Stream Ciphertext (Middle) -> Decipher.
   */
  async getStream(filename) {
    const filePath = path.join(this.uploadDir, filename);

    // Get file size to locate Auth Tag
    const stats = await fsPromises.stat(filePath);
    const fileSize = stats.size;

    // Minimum size = IV (16) + Tag (16)
    if (fileSize < (this.ivLength + this.tagLength)) {
      throw new Error('File corrupted: Too small for encrypted container');
    }

    // Open file to read header and footer
    const fd = await fsPromises.open(filePath, 'r');

    try {
      // Read IV (Header)
      const iv = Buffer.alloc(this.ivLength);
      await fd.read(iv, 0, this.ivLength, 0);

      // Read Auth Tag (Footer)
      const tag = Buffer.alloc(this.tagLength);
      const tagPosition = fileSize - this.tagLength;
      await fd.read(tag, 0, this.tagLength, tagPosition);

      // Configure Decipher with IV and expected Auth Tag
      const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv);
      decipher.setAuthTag(tag);

      // Create Stream for Ciphertext (Everything between IV and Tag)
      const contentSize = tagPosition - this.ivLength;

      if (contentSize === 0) {
        // Handle empty file case (Create empty stream -> Decipher -> Verify Tag)
        const emptyStream = Readable.from([]);
        return emptyStream.pipe(decipher);
      } else {
        // 'end' option in createReadStream is inclusive.
        const readStream = fs.createReadStream(filePath, {
          start: this.ivLength,
          end: tagPosition - 1
        });
        return readStream.pipe(decipher);
      }

    } finally {
      await fd.close();
    }
  }

  /**
   * Local storage does not support direct download URLs.
   * Returns null to signal the controller to proxy the stream.
   */
  async getDownloadUrl(filename) {
    return null;
  }

  /**
   * Returns metadata for the frontend to POST to the internal local proxy endpoint.
   */
  async getUploadUrl(filename, mimetype) {
    return {
      method: 'POST',
      url: '/admin/api/upload-local',
      fields: {},
      key: filename,
      provider: 'local',
      headers: { 'X-File-Name': filename }
    };
  }

  /**
   * Checks if the upload directory is writable.
   */
  async checkHealth() {
    try {
      const testFile = path.join(this.uploadDir, '.healthcheck');
      await fsPromises.writeFile(testFile, 'ok');
      await fsPromises.unlink(testFile);
      return true;
    } catch (e) {
      return false;
    }
  }
}

module.exports = LocalStorageStrategy;
