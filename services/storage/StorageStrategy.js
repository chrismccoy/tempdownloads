/**
 * Abstract Base Class for Storage Strategies.
 *
 * Defines the interface that all storage providers must implement.
 * This enables the Strategy Pattern, allowing the application to switch
 * between Local, S3, and Azure storage without major changes.
 */

class StorageStrategy {
  /**
   * Deletes a file from the storage provider.
   */
  async delete(filename) {
    throw new Error('Method not implemented');
  }

  /**
   * Retrieves file metadata (specifically size).
   */
  async getStats(filename) {
    throw new Error('Method not implemented');
  }

  /**
   * Generates a pre-authenticated URL for downloading (if supported).
   */
  async getDownloadUrl(filename) {
    throw new Error('Method not implemented');
  }

  /**
   * Generates a pre-authenticated URL or Token for uploading.
   */
  async getUploadUrl(filename, mimetype) {
    throw new Error('Method not implemented');
  }

  /**
   * Retrieves a readable stream of the file content.
   */
  async getStream(filename) {
    throw new Error('Method not implemented');
  }

  /**
   * Verifies connectivity to the storage provider.
   */
  async checkHealth() {
    throw new Error('Method not implemented');
  }

  /**
   * Special method for Local Storage to handle stream piping, hashing, and encryption.
   * Only supported by LocalStorageStrategy.
   */
  async saveLocalStream(inputStream, filename, mimeType) {
    throw new Error('Method not supported by this provider');
  }
}

module.exports = StorageStrategy;
