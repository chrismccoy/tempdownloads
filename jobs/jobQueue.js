/**
 * Distributed Job Queue.
 *
 * Provides background job processing with retry logic and failure handling.
 * Designed to be upgraded to Redis-backed queue (Bull/BullMQ) in production.
 */

const logger = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');

/**
 * Job queue configuration
 */
const config = {
  maxRetries: 3,
  retryDelayMs: 1000, // Initial retry delay
  backoffMultiplier: 2, // Exponential backoff
  concurrency: 5, // Process 5 jobs concurrently
  pollIntervalMs: 1000 // Check for new jobs every second
};

/**
 * Job queues by priority
 */
const queues = {
  high: [],
  normal: [],
  low: []
};

/**
 * Currently processing jobs
 */
const activeJobs = new Map();

/**
 * Failed jobs (dead letter queue)
 */
const failedJobs = [];

/**
 * Job handlers registry
 */
const jobHandlers = new Map();

/**
 * Processing flag
 */
let isProcessing = false;
let isShuttingDown = false;

/**
 * Registers a job handler function.
 */
function registerJobHandler(jobType, handler) {
  if (typeof handler !== 'function') {
    throw new Error('Job handler must be a function');
  }

  jobHandlers.set(jobType, handler);
  logger.info(`📋 [QUEUE] Registered handler for job type: ${jobType}`);
}

/**
 * Adds a job to the queue.
 */
function addJob(jobType, data, options = {}) {
  const {
    priority = 'normal',
    maxRetries = config.maxRetries,
    delayMs = 0
  } = options;

  const job = {
    id: uuidv4(),
    type: jobType,
    data,
    priority,
    maxRetries,
    retryCount: 0,
    createdAt: Date.now(),
    processAfter: Date.now() + delayMs,
    status: 'pending'
  };

  // Add to appropriate priority queue
  if (!queues[priority]) {
    logger.warn(`Invalid priority '${priority}', using 'normal'`);
    queues.normal.push(job);
  } else {
    queues[priority].push(job);
  }

  logger.info({
    jobId: job.id,
    jobType,
    priority
  }, '➕ [QUEUE] Job added');

  // Start processing if not already running
  if (!isProcessing) {
    startProcessing();
  }

  return job.id;
}

/**
 * Gets the next job to process (respecting priorities).
 */
function getNextJob() {
  const now = Date.now();

  // Check high priority first
  for (const queue of [queues.high, queues.normal, queues.low]) {
    for (let i = 0; i < queue.length; i++) {
      const job = queue[i];

      // Skip jobs that are delayed
      if (job.processAfter > now) {
        continue;
      }

      // Remove from queue and return
      queue.splice(i, 1);
      return job;
    }
  }

  return null;
}

/**
 * Processes a single job.
 */
async function processJob(job) {
  const handler = jobHandlers.get(job.type);

  if (!handler) {
    logger.error({
      jobId: job.id,
      jobType: job.type
    }, '❌ [QUEUE] No handler registered for job type');

    job.status = 'failed';
    job.error = 'No handler registered';
    failedJobs.push(job);
    return;
  }

  job.status = 'processing';
  job.startedAt = Date.now();
  activeJobs.set(job.id, job);

  logger.info({
    jobId: job.id,
    jobType: job.type,
    retryCount: job.retryCount
  }, '⚙️  [QUEUE] Processing job');

  try {
    // Execute job handler
    // Pass a job-like object that matches BullMQ's job structure
    await handler({
      id: job.id,
      name: job.type,
      data: job.data,
      attemptsMade: job.retryCount
    });

    // Job succeeded
    job.status = 'completed';
    job.completedAt = Date.now();
    activeJobs.delete(job.id);

    logger.info({
      jobId: job.id,
      jobType: job.type,
      duration: job.completedAt - job.startedAt
    }, '✅ [QUEUE] Job completed');

  } catch (error) {
    // Job failed
    job.retryCount++;
    activeJobs.delete(job.id);

    logger.error({
      jobId: job.id,
      jobType: job.type,
      retryCount: job.retryCount,
      maxRetries: job.maxRetries,
      err: error.message
    }, '⚠️  [QUEUE] Job failed');

    // Retry if under max retries
    if (job.retryCount < job.maxRetries) {
      // Calculate exponential backoff delay
      const delay = config.retryDelayMs * Math.pow(config.backoffMultiplier, job.retryCount - 1);
      job.processAfter = Date.now() + delay;
      job.status = 'retrying';

      // Re-queue with delay
      queues[job.priority].push(job);

      logger.info({
        jobId: job.id,
        retryIn: `${delay}ms`
      }, '🔄 [QUEUE] Job scheduled for retry');

    } else {
      // Max retries exceeded - move to dead letter queue
      job.status = 'failed';
      job.error = error.message;
      job.failedAt = Date.now();
      failedJobs.push(job);

      logger.error({
        jobId: job.id,
        jobType: job.type
      }, '💀 [QUEUE] Job moved to dead letter queue');
    }
  }
}

/**
 * Starts the job processing loop.
 */
function startProcessing() {
  if (isProcessing || isShuttingDown) {
    return;
  }

  isProcessing = true;
  logger.info('🚀 [QUEUE] Job processor started');

  // Processing loop
  const processLoop = async () => {
    while (isProcessing && !isShuttingDown) {
      // Check if we have capacity to process more jobs
      if (activeJobs.size < config.concurrency) {
        const job = getNextJob();

        if (job) {
          // Process job without awaiting (allows concurrency)
          processJob(job).catch(err => {
            logger.error({ err }, 'Unexpected error in job processing');
          });
        } else {
          // No jobs available - wait before checking again
          await new Promise(resolve => setTimeout(resolve, config.pollIntervalMs));
        }
      } else {
        // At max concurrency - wait before checking again
        await new Promise(resolve => setTimeout(resolve, config.pollIntervalMs));
      }
    }

    logger.info('🛑 [QUEUE] Job processor stopped');
  };

  // Start the loop
  processLoop().catch(err => {
    logger.error({ err }, 'Fatal error in job processing loop');
    isProcessing = false;
  });
}

/**
 * Gracefully shuts down the job processor.
 * Waits for active jobs to complete.
 */
async function shutdown(timeoutMs = 30000) {
  isShuttingDown = true;
  isProcessing = false;

  logger.info(`🛑 [QUEUE] Shutting down gracefully (${activeJobs.size} active jobs)...`);

  const startTime = Date.now();

  // Wait for active jobs to complete
  while (activeJobs.size > 0 && (Date.now() - startTime) < timeoutMs) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  if (activeJobs.size > 0) {
    logger.warn(`⚠️  [QUEUE] Shutdown timeout - ${activeJobs.size} jobs still active`);
  } else {
    logger.info('✅ [QUEUE] All jobs completed successfully');
  }
}

/**
 * Gets queue statistics.
 */
function getStats() {
  return {
    pending: queues.high.length + queues.normal.length + queues.low.length,
    active: activeJobs.size,
    failed: failedJobs.length,
    queues: {
      high: queues.high.length,
      normal: queues.normal.length,
      low: queues.low.length
    }
  };
}

module.exports = {
  registerJobHandler,
  addJob,
  startProcessing,
  shutdown,
  getStats
};
