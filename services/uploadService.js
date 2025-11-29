/**
 * Upload Service.
 */

const Busboy = require('busboy');
const { v4: uuidv4 } = require('uuid');
const { LIMITS } = require('../constants');
const AppError = require('../utils/AppError').AppError;

class UploadService {
  constructor(storageService) {
    this.storageService = storageService;
  }

  /**
   * Handles a Local File Upload Request via Streaming.
   */
  async handleLocalUpload(req) {
    const busboy = Busboy({ headers: req.headers, limits: { fileSize: LIMITS.MAX_FILE_SIZE_BYTES } });

    return new Promise((resolve, reject) => {
      let fileProcessed = false;
      let settled = false;

      // Cleanup function to prevent memory leaks
      const cleanup = () => {
        busboy.removeAllListeners();
      };

      // Safe resolve that cleans up listeners
      const safeResolve = (value) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(value);
      };

      // Safe reject that cleans up listeners
      const safeReject = (error) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      };

      // Event: File Field Found
      const handleFile = async (name, fileStream, info) => {
        fileProcessed = true;
        const { filename, mimeType } = info;

        // Generate a secure, unique storage key
        const { generateStorageKey } = require('../utils/fileSanitizer');
        const fileKey = generateStorageKey(filename);

        try {
          // Delegate the heavy lifting (Hashing, Encrypting, Writing) to StorageService
          // This ensures the controller doesn't know about disk paths or crypto details.
          const result = await this.storageService.saveLocalStream(fileStream, fileKey, mimeType);

          safeResolve({
            key: fileKey,
            checksum: result.checksum,
            isEncrypted: result.isEncrypted
          });
        } catch (err) {
          // If processing fails (e.g., invalid magic bytes), ensure the stream is drained
          fileStream.resume();
          safeReject(err);
        }
      };

      // Event: Parsing Finished
      const handleFinish = () => {
        if (!fileProcessed) {
          safeReject(new AppError('No file provided in request body', 400));
        }
      };

      // Event: Error
      const handleError = (err) => {
        safeReject(err);
      };

      // Attach event listeners
      busboy.on('file', handleFile);
      busboy.on('finish', handleFinish);
      busboy.on('error', handleError);

      // Begin piping the request body into Busboy
      req.pipe(busboy);
    });
  }
}

module.exports = UploadService;
