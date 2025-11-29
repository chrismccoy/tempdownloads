/**
 * Unified Job Queue Interface.
 *
 * Automatically selects BullMQ or in-memory queue based on configuration.
 * Provides fallback to in-memory queue if Redis is unavailable.
 */

const logger = require('../utils/logger');

/**
 * Queue backend instance
 */
let queueBackend = null;
let backendType = 'unknown';

/**
 * Initializes the queue backend
 */
function initializeQueue() {
  const useBullMQ = process.env.BULLMQ_ENABLED === 'true';

  try {
    if (useBullMQ) {
      queueBackend = require('./bullQueue');
      backendType = 'bullmq';
      logger.info('🔗 [QUEUE] Using BullMQ distributed queue backend');
    } else {
      queueBackend = require('./jobQueue');
      backendType = 'memory';
      logger.info('💾 [QUEUE] Using in-memory queue backend');
    }
  } catch (error) {
    logger.error({ err: error }, '❌ [QUEUE] Failed to initialize queue, falling back to in-memory');
    queueBackend = require('./jobQueue');
    backendType = 'memory';
  }
}

/**
 * Registers a job handler function.
 */
function registerJobHandler(jobType, handler, options = {}) {
  if (!queueBackend) {
    initializeQueue();
  }

  // Wrap handler to normalize job format between BullMQ and memory queue
  const normalizedHandler = async (job) => {
    // BullMQ passes a Job instance, memory queue passes data directly
    const isBullMQ = job && typeof job === 'object' && 'data' in job;

    if (isBullMQ) {
      // BullMQ Job instance
      return await handler(job);
    } else {
      // Memory queue: wrap data in pseudo-Job object for consistency
      const pseudoJob = {
        data: job,
        id: job.correlationId || 'unknown',
        name: jobType
      };
      return await handler(pseudoJob);
    }
  };

  return queueBackend.registerJobHandler(jobType, normalizedHandler, options);
}

/**
 * Adds a job to the queue.
 */
async function addJob(jobType, data, options = {}) {
  if (!queueBackend) {
    initializeQueue();
  }

  try {
    // Normalize priority format
    const normalizedOptions = { ...options };

    if (backendType === 'bullmq') {
      // Convert string priority to numeric (1-10) for BullMQ
      if (typeof options.priority === 'string') {
        const priorityMap = {
          high: 1,
          normal: 5,
          low: 10
        };
        normalizedOptions.priority = priorityMap[options.priority] || 5;
      }
    } else {
      // Convert numeric priority to string for memory queue
      if (typeof options.priority === 'number') {
        if (options.priority <= 3) {
          normalizedOptions.priority = 'high';
        } else if (options.priority >= 7) {
          normalizedOptions.priority = 'low';
        } else {
          normalizedOptions.priority = 'normal';
        }
      }
    }

    return await Promise.resolve(queueBackend.addJob(jobType, data, normalizedOptions));
  } catch (error) {
    logger.error({ err: error, jobType }, '❌ [QUEUE] Failed to add job');
    throw error;
  }
}

/**
 * Gets job status and progress (BullMQ only).
 */
async function getJobStatus(jobId, queueName) {
  if (!queueBackend) {
    initializeQueue();
  }

  if (backendType === 'memory') {
    // Memory queue doesn't support job status queries
    logger.warn('Job status queries not supported with in-memory queue');
    return null;
  }

  try {
    return await queueBackend.getJobStatus(jobId, queueName);
  } catch (error) {
    logger.error({ err: error, jobId, queueName }, '❌ [QUEUE] Failed to get job status');
    return null;
  }
}

/**
 * Gets queue statistics.
 */
async function getQueueStats(queueName) {
  if (!queueBackend) {
    initializeQueue();
  }

  try {
    if (backendType === 'bullmq') {
      return await queueBackend.getQueueStats(queueName);
    } else {
      return queueBackend.getStats();
    }
  } catch (error) {
    logger.error({ err: error, queueName }, '❌ [QUEUE] Failed to get queue stats');
    return null;
  }
}

/**
 * Gets general statistics.
 */
function getStats() {
  if (!queueBackend) {
    initializeQueue();
  }

  const stats = queueBackend.getStats ? queueBackend.getStats() : {};

  return {
    ...stats,
    backend: backendType
  };
}

/**
 * Gracefully shuts down the queue.
 */
async function shutdown() {
  if (!queueBackend) {
    return;
  }

  try {
    if (queueBackend.shutdown) {
      await queueBackend.shutdown();
    }
  } catch (error) {
    logger.error({ err: error }, '❌ [QUEUE] Shutdown failed');
  }
}

initializeQueue();

module.exports = {
  registerJobHandler,
  addJob,
  getJobStatus,
  getQueueStats,
  getStats,
  shutdown
};
