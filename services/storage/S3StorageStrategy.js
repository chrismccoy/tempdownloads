/**
 * AWS S3 Storage Strategy.
 *
 * Uses Presigned URLs for direct client-to-bucket uploads/downloads.
 * Supports both AWS S3 and S3-compatible storage (e.g., MinIO).
 */

const {
  S3Client,
  DeleteObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  ListObjectsV2Command
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const config = require('../../config');
const StorageStrategy = require('./StorageStrategy');

class S3StorageStrategy extends StorageStrategy {
  /**
   * Initializes S3 Client with configuration.
   */
  constructor() {
    super();
    this.client = new S3Client({
      region: config.storage.s3.region,
      endpoint: config.storage.s3.endpoint || undefined,
      credentials: {
        accessKeyId: config.storage.s3.accessKeyId,
        secretAccessKey: config.storage.s3.secretAccessKey,
      },
      forcePathStyle: !!config.storage.s3.endpoint, // Required for MinIO
    });
    this.bucket = config.storage.s3.bucket;
  }

  /**
   * Throws error as S3 uses direct client-side upload.
   */
  async saveLocalStream(inputStream) {
    throw new Error('S3 uses direct upload, local stream not supported.');
  }

  /**
   * Deletes object from S3 Bucket.
   */
  async delete(filename) {
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: filename }));
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Gets object metadata (ContentLength) via HeadObject.
   */
  async getStats(filename) {
    const command = new HeadObjectCommand({ Bucket: this.bucket, Key: filename });
    const response = await this.client.send(command);
    return { size: response.ContentLength };
  }

  /**
   * Gets a ReadableStream of the object body.
   * Used if proxying is required (e.g. for Burn-on-Read validation before piping).
   */
  async getStream(filename) {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: filename });
    const response = await this.client.send(command);
    return response.Body;
  }

  /**
   * Generates a signed GET URL for downloading directly from S3.
   * Valid for 15 minutes (900s).
   */
  async getDownloadUrl(filename) {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: filename });
    return await getSignedUrl(this.client, command, { expiresIn: 900 });
  }

  /**
   * Generates a signed PUT URL for uploading directly to S3.
   * Valid for 5 minutes (300s).
   */
  async getUploadUrl(filename, mimetype) {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: filename,
      ContentType: mimetype,
    });
    const url = await getSignedUrl(this.client, command, { expiresIn: 300 });

    return {
      method: 'PUT',
      url: url,
      fields: {},
      key: filename,
      provider: 's3',
      headers: { 'Content-Type': mimetype }
    };
  }

  /**
   * Lists 1 object to verify credentials and bucket access.
   */
  async checkHealth() {
    try {
      await this.client.send(new ListObjectsV2Command({ Bucket: this.bucket, MaxKeys: 1 }));
      return true;
    } catch (e) {
      return false;
    }
  }
}

module.exports = S3StorageStrategy;
