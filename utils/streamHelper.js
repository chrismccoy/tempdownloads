/**
 * Stream Helper Utilities.
 *
 * Provides reusable functions for safe stream handling with proper error handling,
 * cleanup, and timeout protection.
 */

const crypto = require('crypto');
const { Transform } = require('stream');
const logger = require('./logger');
const { TIMEOUTS } = require('../constants');

/**
 * Pipes a readable stream to a writable stream with comprehensive error handling.
 */
function pipeWithErrorHandling(source, destination, options = {}) {
  const {
    timeout = TIMEOUTS.REQUEST_TIMEOUT_MS,
    operation = 'stream operation',
    correlationId = null
  } = options;

  return new Promise((resolve, reject) => {
    let finished = false;
    let timeoutHandle = null;

    // Cleanup function to remove all listeners and destroy streams
    const cleanup = () => {
      if (finished) return;
      finished = true;

      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }

      // Remove all listeners to prevent memory leaks
      source.removeAllListeners();
      destination.removeAllListeners();
    };

    // Set timeout if specified
    if (timeout > 0) {
      timeoutHandle = setTimeout(() => {
        if (finished) return;
        finished = true;

        logger.error({
          reqId: correlationId,
          operation,
          timeout: `${timeout}ms`
        }, `Stream timeout exceeded for ${operation}`);

        // Destroy both streams
        if (source.destroy) source.destroy();
        if (destination.destroy) destination.destroy();

        reject(new Error(`Stream timeout exceeded for ${operation}`));
      }, timeout);
    }

    // Handle source stream errors
    source.on('error', (err) => {
      if (finished) return;
      finished = true;

      logger.error({
        reqId: correlationId,
        operation,
        err
      }, `Source stream error during ${operation}`);

      // Destroy source stream to free resources
      if (source.destroy) source.destroy();

      // Don't destroy destination if response already sent
      if (destination.destroy && !destination.headersSent) {
        destination.destroy();
      }

      cleanup();
      reject(err);
    });

    // Handle destination stream errors
    destination.on('error', (err) => {
      if (finished) return;
      finished = true;

      logger.error({
        reqId: correlationId,
        operation,
        err
      }, `Destination stream error during ${operation}`);

      // Destroy both streams
      if (source.destroy) source.destroy();
      if (destination.destroy) destination.destroy();

      cleanup();
      reject(err);
    });

    // Handle successful completion
    destination.on('finish', () => {
      if (finished) return;
      finished = true;

      cleanup();
      resolve();
    });

    // Handle destination close (client disconnected)
    destination.on('close', () => {
      if (finished) return;
      finished = true;

      logger.warn({
        reqId: correlationId,
        operation
      }, `Destination closed during ${operation}`);

      // Destroy source stream
      if (source.destroy) source.destroy();

      cleanup();
      // Don't reject - this is expected when client disconnects
      resolve();
    });

    // Start piping
    source.pipe(destination);
  });
}

/**
 * Wraps a stream creation function with error handling.
 */
async function createStreamSafely(createStream, options = {}) {
  const { operation = 'stream creation', correlationId = null } = options;

  try {
    const stream = await createStream();

    // Attach error handler immediately
    stream.on('error', (err) => {
      logger.error({
        reqId: correlationId,
        operation,
        err
      }, `Stream error during ${operation}`);

      // Destroy stream to free resources
      if (stream.destroy) stream.destroy();
    });

    return stream;
  } catch (err) {
    logger.error({
      reqId: correlationId,
      operation,
      err
    }, `Failed to create stream for ${operation}`);

    throw err;
  }
}

/**
 * Reads a stream into a buffer with error handling and size limit.
 */
function streamToBuffer(stream, options = {}) {
  const {
    maxSize = 10 * 1024 * 1024, // 10MB default
    timeout = TIMEOUTS.REQUEST_TIMEOUT_MS,
    correlationId = null
  } = options;

  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let finished = false;
    let timeoutHandle = null;

    const cleanup = () => {
      if (finished) return;
      finished = true;

      if (timeoutHandle) clearTimeout(timeoutHandle);
      stream.removeAllListeners();
    };

    // Set timeout
    if (timeout > 0) {
      timeoutHandle = setTimeout(() => {
        if (finished) return;
        finished = true;

        logger.error({ reqId: correlationId }, 'Stream to buffer timeout');
        if (stream.destroy) stream.destroy();
        cleanup();
        reject(new Error('Stream to buffer timeout'));
      }, timeout);
    }

    stream.on('data', (chunk) => {
      size += chunk.length;

      // Check size limit
      if (size > maxSize) {
        if (finished) return;
        finished = true;

        logger.error({ reqId: correlationId, size, maxSize }, 'Stream exceeded max size');
        if (stream.destroy) stream.destroy();
        cleanup();
        reject(new Error(`Stream size ${size} exceeds maximum ${maxSize}`));
        return;
      }

      chunks.push(chunk);
    });

    stream.on('end', () => {
      if (finished) return;
      finished = true;

      cleanup();
      resolve(Buffer.concat(chunks));
    });

    stream.on('error', (err) => {
      if (finished) return;
      finished = true;

      logger.error({ reqId: correlationId, err }, 'Stream error');
      if (stream.destroy) stream.destroy();
      cleanup();
      reject(err);
    });
  });
}

/**
 * Creates a checksum verification stream.
 */
function createChecksumVerifier(expectedChecksum, options = {}) {
  const { correlationId = null } = options;
  const hash = crypto.createHash('sha256');
  let verified = false;

  return new Transform({
    transform(chunk, encoding, callback) {
      // Pass through data while calculating hash
      hash.update(chunk);
      callback(null, chunk);
    },
    flush(callback) {
      // Verify checksum when stream ends
      const actualChecksum = hash.digest('hex');

      if (actualChecksum !== expectedChecksum) {
        logger.error({
          reqId: correlationId,
          expected: expectedChecksum,
          actual: actualChecksum
        }, '❌ Checksum verification failed - file may be corrupted');

        // Emit error to abort the download
        callback(new Error('File integrity check failed - file may be corrupted'));
      } else {
        logger.debug({
          reqId: correlationId,
          checksum: actualChecksum
        }, '✅ Checksum verification passed');

        verified = true;
        callback();
      }
    }
  });
}

/**
 * Pipes a stream with checksum verification.
 */
function pipeWithChecksumVerification(source, destination, expectedChecksum, options = {}) {
  if (!expectedChecksum) {
    // No checksum available, skip verification
    return pipeWithErrorHandling(source, destination, options);
  }

  const { correlationId = null } = options;
  const verifier = createChecksumVerifier(expectedChecksum, { correlationId });

  return new Promise((resolve, reject) => {
    // Use existing error handling for the pipe
    pipeWithErrorHandling(source.pipe(verifier), destination, options)
      .then(resolve)
      .catch(reject);
  });
}

module.exports = {
  pipeWithErrorHandling,
  createStreamSafely,
  streamToBuffer,
  createChecksumVerifier,
  pipeWithChecksumVerification
};
