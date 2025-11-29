/**
 * Azure Blob Storage Strategy.
 *
 * Uses Shared Access Signatures (SAS) for direct client-side access.
 * Provides secure, temporary URLs for uploading and downloading blobs.
 */

const {
  BlobServiceClient,
  generateBlobSASQueryParameters,
  BlobSASPermissions,
  StorageSharedKeyCredential,
} = require('@azure/storage-blob');
const config = require('../../config');
const StorageStrategy = require('./StorageStrategy');

class AzureStorageStrategy extends StorageStrategy {

  /**
   * Initializes Azure BlobServiceClient.
   */
  constructor() {
    super();
    this.blobServiceClient = BlobServiceClient.fromConnectionString(config.storage.azure.connectionString);
    this.containerClient = this.blobServiceClient.getContainerClient(config.storage.azure.container);
    // Ensure container exists on startup (fire and forget)
    this.containerClient.createIfNotExists().catch(() => {});
  }

  /**
   * Throws error as Azure uses direct client-side upload.
   */
  async saveLocalStream(inputStream) {
    throw new Error('Azure uses direct upload, local stream not supported.');
  }

  /**
   * Deletes a block blob from the container.
   */
  async delete(filename) {
    try {
      await this.containerClient.getBlockBlobClient(filename).delete();
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Retrieves blob properties.
   */
  async getStats(filename) {
    const props = await this.containerClient.getBlockBlobClient(filename).getProperties();
    return { size: props.contentLength };
  }

  /**
   * Downloads a blob to a ReadableStream.
   */
  async getStream(filename) {
    const downloadResponse = await this.containerClient.getBlockBlobClient(filename).download();
    return downloadResponse.readableStreamBody;
  }

  /**
   * Generates a Read-only SAS URL.
   * Valid for 15 minutes.
   */
  async getDownloadUrl(filename) {
    const sasToken = this._generateSasToken(filename, 'r', 15);
    return `${this.containerClient.getBlockBlobClient(filename).url}?${sasToken}`;
  }

  /**
   * Generates a Write-only SAS URL for uploading.
   * Valid for 5 minutes.
   */
  async getUploadUrl(filename, mimetype) {
    const sasToken = this._generateSasToken(filename, 'w', 5);
    const url = `${this.containerClient.getBlockBlobClient(filename).url}?${sasToken}`;

    return {
      method: 'PUT',
      url: url,
      fields: {},
      key: filename,
      provider: 'azure',
      headers: { 'x-ms-blob-type': 'BlockBlob' }
    };
  }

  /**
   * Checks container properties to verify connectivity.
   */
  async checkHealth() {
    try {
      await this.containerClient.getProperties();
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Helper to generate SAS tokens using StorageSharedKeyCredential.
   */
  _generateSasToken(filename, permissions, minutes) {
    const credential = new StorageSharedKeyCredential(
      this.blobServiceClient.accountName,
      this.blobServiceClient.credential.accountKey
    );
    return generateBlobSASQueryParameters({
      containerName: config.storage.azure.container,
      blobName: filename,
      permissions: BlobSASPermissions.parse(permissions),
      startsOn: new Date(),
      expiresOn: new Date(new Date().valueOf() + minutes * 60 * 1000)
    }, credential).toString();
  }
}

module.exports = AzureStorageStrategy;
