/**
 * Distributed Job Queue using BullMQ.
 *
 * Production job queue with Redis backend for multi-server deployments.
 * Replaces the in-memory jobQueue.js with distributed queue capabilities.
 */

const { Queue, Worker, QueueEvents } = require('bullmq');
const logger = require('../utils/logger');

/**
 * BullMQ configuration
 */
const config = {
  enabled: process.env.BULLMQ_ENABLED === 'true',
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || '1', 10), // Use different DB from cache
    maxRetriesPerRequest: 3
  },
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000 // Start with 1 second delay
    },
    removeOnComplete: {
      age: 86400, // Keep completed jobs for 24 hours
      count: 1000 // Keep last 1000 completed jobs
    },
    removeOnFail: {
      age: 604800 // Keep failed jobs for 7 days
    }
  },
  workerOptions: {
    concurrency: 5, // Process 5 jobs concurrently per worker
    lockDuration: 30000, // 30 seconds lock duration
    maxStalledCount: 3 // Retry stalled jobs 3 times
  }
};

/**
 * Job queues by type
 */
const queues = new Map();

/**
 * Workers by queue name
 */
const workers = new Map();

/**
 * Queue events listeners
 */
const queueEvents = new Map();

/**
 * Job handlers registry
 */
const jobHandlers = new Map();

/**
 * Fallback to in-memory queue if BullMQ/Redis not available
 */
let fallbackQueue = null;

/**
 * Initializes a queue for a specific job type.
 */
function getOrCreateQueue(queueName) {
  if (!config.enabled) {
    if (!fallbackQueue) {
      fallbackQueue = require('./jobQueue');
      logger.warn('⚠️  [QUEUE] BullMQ disabled, using in-memory fallback queue');
    }
    return null;
  }

  if (queues.has(queueName)) {
    return queues.get(queueName);
  }

  try {
    const queue = new Queue(queueName, {
      connection: config.redis,
      defaultJobOptions: config.defaultJobOptions
    });

    // Setup queue events for monitoring
    const events = new QueueEvents(queueName, {
      connection: config.redis
    });

    events.on('completed', ({ jobId }) => {
      logger.info({ jobId, queue: queueName }, '✅ [QUEUE] Job completed');
    });

    events.on('failed', ({ jobId, failedReason }) => {
      logger.error({
        jobId,
        queue: queueName,
        reason: failedReason
      }, '❌ [QUEUE] Job failed');
    });

    events.on('stalled', ({ jobId }) => {
      logger.warn({ jobId, queue: queueName }, '⚠️  [QUEUE] Job stalled');
    });

    queues.set(queueName, queue);
    queueEvents.set(queueName, events);

    logger.info({ queue: queueName }, '📋 [QUEUE] Queue initialized');

    return queue;

  } catch (error) {
    logger.error({ err: error, queue: queueName }, '❌ [QUEUE] Failed to initialize queue');
    useFallbackQueue();
    return null;
  }
}

/**
 * Falls back to in-memory queue
 */
function useFallbackQueue() {
  if (!fallbackQueue) {
    fallbackQueue = require('./jobQueue');
    logger.warn('⚠️  [QUEUE] Using in-memory fallback queue');
  }
}

/**
 * Registers a job handler function.
 */
function registerJobHandler(jobType, handler, options = {}) {
  if (typeof handler !== 'function') {
    throw new Error('Job handler must be a function');
  }

  const queueName = options.queueName || jobType;

  jobHandlers.set(jobType, { handler, queueName });

  // Use fallback if BullMQ not enabled
  if (!config.enabled) {
    if (!fallbackQueue) {
      useFallbackQueue();
    }
    return fallbackQueue.registerJobHandler(jobType, handler);
  }

  // Initialize queue
  getOrCreateQueue(queueName);

  // Create worker if not already created for this queue
  if (!workers.has(queueName)) {
    try {
      const worker = new Worker(
        queueName,
        async (job) => {
          const { handler: jobHandler } = jobHandlers.get(job.name) || {};

          if (!jobHandler) {
            throw new Error(`No handler registered for job type: ${job.name}`);
          }

          logger.info({
            jobId: job.id,
            jobType: job.name,
            attempt: job.attemptsMade + 1
          }, '🔄 [QUEUE] Processing job');

          // Execute handler
          return await jobHandler(job);
        },
        {
          connection: config.redis,
          ...config.workerOptions,
          ...options
        }
      );

      worker.on('completed', (job) => {
        logger.info({
          jobId: job.id,
          jobType: job.name,
          duration: job.finishedOn - job.processedOn
        }, '✅ [QUEUE] Job completed successfully');
      });

      worker.on('failed', (job, err) => {
        logger.error({
          jobId: job?.id,
          jobType: job?.name,
          err: err.message,
          attempts: job?.attemptsMade
        }, '❌ [QUEUE] Job failed');
      });

      worker.on('error', (err) => {
        logger.error({ err, queue: queueName }, '❌ [QUEUE] Worker error');
      });

      workers.set(queueName, worker);

      logger.info({
        queue: queueName,
        jobType,
        concurrency: options.concurrency || config.workerOptions.concurrency
      }, '👷 [QUEUE] Worker started');

    } catch (error) {
      logger.error({
        err: error,
        queue: queueName,
        jobType
      }, '❌ [QUEUE] Failed to create worker');
      useFallbackQueue();
    }
  }
}

/**
 * Adds a job to the queue.
 */
async function addJob(jobType, data, options = {}) {
  const { priority, maxRetries, delayMs, jobId, queueName } = options;

  // Use fallback if BullMQ not enabled
  if (!config.enabled || fallbackQueue) {
    if (!fallbackQueue) {
      useFallbackQueue();
    }
    return fallbackQueue.addJob(jobType, data, {
      priority: priority === 1 ? 'high' : priority >= 5 ? 'low' : 'normal',
      maxRetries,
      delayMs
    });
  }

  const targetQueue = queueName || jobType;
  const queue = getOrCreateQueue(targetQueue);

  if (!queue) {
    // Failed to create queue, use fallback
    useFallbackQueue();
    return fallbackQueue.addJob(jobType, data, options);
  }

  try {
    const jobOptions = {
      priority,
      delay: delayMs,
      jobId
    };

    // Override retry attempts if specified
    if (maxRetries !== undefined) {
      jobOptions.attempts = maxRetries;
    }

    const job = await queue.add(jobType, data, jobOptions);

    logger.info({
      jobId: job.id,
      jobType,
      queue: targetQueue,
      priority,
      delay: delayMs
    }, '📋 [QUEUE] Job added to queue');

    return job.id;

  } catch (error) {
    logger.error({
      err: error,
      jobType,
      queue: targetQueue
    }, '❌ [QUEUE] Failed to add job');

    // Fall back to in-memory queue
    useFallbackQueue();
    return fallbackQueue.addJob(jobType, data, options);
  }
}

/**
 * Gets job status and progress.
 */
async function getJobStatus(jobId, queueName) {
  if (!config.enabled || fallbackQueue) {
    // Fallback doesn't support job status queries
    return null;
  }

  const queue = queues.get(queueName);
  if (!queue) {
    return null;
  }

  try {
    const job = await queue.getJob(jobId);
    if (!job) {
      return null;
    }

    return {
      id: job.id,
      name: job.name,
      data: job.data,
      state: await job.getState(),
      progress: job.progress,
      attemptsMade: job.attemptsMade,
      failedReason: job.failedReason,
      finishedOn: job.finishedOn,
      processedOn: job.processedOn
    };

  } catch (error) {
    logger.error({ err: error, jobId, queueName }, '❌ [QUEUE] Failed to get job status');
    return null;
  }
}

/**
 * Gets queue statistics.
 */
async function getQueueStats(queueName) {
  if (!config.enabled || fallbackQueue) {
    return fallbackQueue ? fallbackQueue.getStats() : null;
  }

  const queue = queues.get(queueName);
  if (!queue) {
    return null;
  }

  try {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount()
    ]);

    return {
      queueName,
      waiting,
      active,
      completed,
      failed,
      delayed,
      total: waiting + active + completed + failed + delayed
    };

  } catch (error) {
    logger.error({ err: error, queueName }, '❌ [QUEUE] Failed to get queue stats');
    return null;
  }
}

/**
 * Gracefully shuts down all workers and closes connections.
 */
async function shutdown() {
  logger.info('🛑 [QUEUE] Shutting down gracefully...');

  // Close all workers
  for (const [queueName, worker] of workers.entries()) {
    try {
      await worker.close();
      logger.info({ queue: queueName }, '👷 [QUEUE] Worker closed');
    } catch (error) {
      logger.error({ err: error, queue: queueName }, '❌ [QUEUE] Failed to close worker');
    }
  }

  // Close all queue events
  for (const [queueName, events] of queueEvents.entries()) {
    try {
      await events.close();
    } catch (error) {
      logger.error({ err: error, queue: queueName }, '❌ [QUEUE] Failed to close queue events');
    }
  }

  // Close all queues
  for (const [queueName, queue] of queues.entries()) {
    try {
      await queue.close();
      logger.info({ queue: queueName }, '📋 [QUEUE] Queue closed');
    } catch (error) {
      logger.error({ err: error, queue: queueName }, '❌ [QUEUE] Failed to close queue');
    }
  }

  logger.info('👋 [QUEUE] Shutdown complete');
}

module.exports = {
  registerJobHandler,
  addJob,
  getJobStatus,
  getQueueStats,
  shutdown,
  config
};
