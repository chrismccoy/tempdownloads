/**
 * Background Job Scheduler.
 */

const cron = require('node-cron');
const linkService = require('../services/linkService');
const storageService = require('../services/storageService');
const db = require('../db/database');
const logger = require('../utils/logger');
const jobQueue = require('./bullQueue');

/**
 * Initializes and starts the scheduled tasks.
 */
function initScheduler() {
  // Register job handlers for the job queue

  // Handler for burn-on-read deletions (high priority)
  jobQueue.registerJobHandler('burn_deletion', async (job) => {
    const data = job.data || job; // Support both BullMQ (job.data) and fallback (job)

    // Permanently delete the link and its associated file
    await linkService.permanentlyDeleteLink(data.linkId, data.correlationId);

    logger.info({
      linkId: data.linkId,
      reqId: data.correlationId
    }, '🔥 [BURN] Link permanently deleted via job queue');
  });

  // Handler for regular file deletions
  jobQueue.registerJobHandler('file_deletion', async (job) => {
    const data = job.data || job; // Support both BullMQ (job.data) and fallback (job)

    await storageService.delete(data.storageKey);

    // Remove from failed deletions table if it exists
    if (data.failedDeletionId) {
      await db('failed_file_deletions').where({ id: data.failedDeletionId }).delete();
    }

    logger.info({
      storageKey: data.storageKey,
      linkId: data.linkId
    }, '🗑️  File deleted successfully via job queue');
  });

  // BullMQ workers start automatically when handlers are registered

  /**
   * Cleanup Task.
   */
  cron.schedule('*/15 * * * *', async () => {
    logger.info('⏰ [SCHEDULER] Starting scheduled cleanup task...');

    try {
      // Triggers the Garbage Collection logic in LinkService.
      // This checks DB for expired/deleted rows and removes corresponding files.
      await linkService.processCleanup();

      logger.info('✅ [SCHEDULER] Cleanup task completed.');
    } catch (error) {
      // Log failure but do not crash the process
      logger.error({ err: error }, '❌ [SCHEDULER] Cleanup task failed.');
    }
  });

  /**
   * Retry Failed File Deletions Task.
   */
  cron.schedule('*/30 * * * *', async () => {
    logger.info('⏰ [SCHEDULER] Starting failed file deletions retry task...');

    try {
      // Get failed deletions older than 1 hour (giving time for transient failures)
      const failedDeletions = await db('failed_file_deletions')
        .where('created_at', '<', Date.now() - 3600000) // 1 hour ago
        .where('retry_count', '<', 5) // Max 5 retries
        .limit(50); // Process 50 at a time

      let successCount = 0;
      let failureCount = 0;

      // Queue failed deletions for retry using job queue
      for (const item of failedDeletions) {
        try {
          // Add to job queue with high priority
          jobQueue.addJob('file_deletion', {
            storageKey: item.storage_key,
            linkId: item.link_id,
            failedDeletionId: item.id
          }, {
            priority: 'high',
            maxRetries: 3
          });

          successCount++;
        } catch (err) {
          // Failed to queue - update retry count in DB
          await db('failed_file_deletions')
            .where({ id: item.id })
            .update({
              retry_count: item.retry_count + 1,
              last_retry_at: Date.now(),
              error_message: err.message
            });
          failureCount++;

          logger.warn({
            action: 'RETRY_FILE_DELETION_QUEUE_FAILED',
            storageKey: item.storage_key,
            error: err.message
          });
        }
      }

      if (successCount > 0 || failureCount > 0) {
        logger.info(`✅ [SCHEDULER] Retry task completed: ${successCount} queued, ${failureCount} failed.`);
      }
    } catch (error) {
      logger.error({ err: error }, '❌ [SCHEDULER] Retry task failed.');
    }
  });

  /**
   * Storage Health Check Task.
   */
  cron.schedule('*/5 * * * *', async () => {
    logger.info('⏰ [SCHEDULER] Running storage health check...');

    try {
      const startTime = Date.now();
      const isHealthy = await storageService.checkHealth();
      const latency = Date.now() - startTime;

      if (!isHealthy) {
        logger.error({
          provider: require('../config').storage.provider,
          latency_ms: latency
        }, '❌ [HEALTH] Storage connectivity check FAILED - storage provider is unreachable');
      } else if (latency > 5000) {
        // Warn if health check takes more than 5 seconds
        logger.warn({
          provider: require('../config').storage.provider,
          latency_ms: latency
        }, '⚠️  [HEALTH] Storage connectivity slow - high latency detected');
      } else {
        logger.info({
          provider: require('../config').storage.provider,
          latency_ms: latency
        }, '✅ [HEALTH] Storage connectivity OK');
      }
    } catch (error) {
      logger.error({
        err: error,
        provider: require('../config').storage.provider
      }, '❌ [HEALTH] Storage health check failed with error');
    }
  });

  logger.info('⏳ [SYSTEM] Background Scheduler Initialized (Cleanup: 15 mins, Retry: 30 mins, Health: 5 mins).');
}

module.exports = { initScheduler };
