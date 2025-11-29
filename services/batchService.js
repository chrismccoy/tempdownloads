/**
 * Batch Operations Service.
 *
 * Provides batch operations for links using job queues.
 */

const bullQueue = require('../jobs/bullQueue');
const {
  batchSoftDeleteHandler,
  batchRestoreHandler,
  batchForceDeleteHandler
} = require('../jobs/batchJobHandlers');
const logger = require('../utils/logger');
const linkService = require('./linkService');
const container = require('../container');

/**
 * Maximum items allowed in a single batch operation.
 */
const MAX_BATCH_SIZE = 100;

/**
 * Registers batch job handlers with BullMQ.
 */
function registerBatchHandlers() {
  try {
    bullQueue.registerJobHandler('batch_soft_delete', batchSoftDeleteHandler, {
      queueName: 'batch_operations',
      concurrency: 5 // Process 5 deletions concurrently
    });

    bullQueue.registerJobHandler('batch_restore', batchRestoreHandler, {
      queueName: 'batch_operations',
      concurrency: 5
    });

    bullQueue.registerJobHandler('batch_force_delete', batchForceDeleteHandler, {
      queueName: 'batch_operations',
      concurrency: 5
    });

    logger.info('✅ [BATCH] Batch job handlers registered');
  } catch (error) {
    logger.error({ err: error }, '❌ [BATCH] Failed to register batch handlers');
  }
}

/**
 * Queues batch soft delete jobs (move to trash).
 */
async function queueBatchSoftDelete(linkIds, session, correlationId, ip) {
  if (!Array.isArray(linkIds) || linkIds.length === 0) {
    throw new Error('No links selected');
  }

  if (linkIds.length > MAX_BATCH_SIZE) {
    throw new Error(`Maximum ${MAX_BATCH_SIZE} items per batch`);
  }

  const jobIds = [];
  const errors = [];

  // Queue individual jobs for each link
  for (const linkId of linkIds) {
    try {
      const jobId = await bullQueue.addJob('batch_soft_delete', {
        linkId,
        userId: session.userId,
        userRole: session.role,
        correlationId,
        ip
      }, {
        priority: 5, // Normal priority
        maxRetries: 3,
        queueName: 'batch_operations'
      });

      jobIds.push(jobId);
    } catch (error) {
      logger.error({ linkId, err: error.message }, 'Failed to queue soft delete job');
      errors.push({ linkId, error: error.message });
    }
  }

  logger.info({
    totalJobs: jobIds.length,
    failed: errors.length,
    correlationId
  }, 'Batch soft delete jobs queued');

  return {
    queued: jobIds.length,
    failed: errors.length,
    jobIds,
    errors,
    message: `${jobIds.length} deletion(s) queued for processing${errors.length > 0 ? `, ${errors.length} failed to queue` : ''}`
  };
}

/**
 * Queues batch restore jobs.
 */
async function queueBatchRestore(linkIds, session, correlationId, ip) {
  if (!Array.isArray(linkIds) || linkIds.length === 0) {
    throw new Error('No links selected');
  }

  if (linkIds.length > MAX_BATCH_SIZE) {
    throw new Error(`Maximum ${MAX_BATCH_SIZE} items per batch`);
  }

  const jobIds = [];
  const errors = [];

  for (const linkId of linkIds) {
    try {
      const jobId = await bullQueue.addJob('batch_restore', {
        linkId,
        userId: session.userId,
        userRole: session.role,
        correlationId,
        ip
      }, {
        priority: 5,
        maxRetries: 3,
        queueName: 'batch_operations'
      });

      jobIds.push(jobId);
    } catch (error) {
      logger.error({ linkId, err: error.message }, 'Failed to queue restore job');
      errors.push({ linkId, error: error.message });
    }
  }

  logger.info({
    totalJobs: jobIds.length,
    failed: errors.length,
    correlationId
  }, 'Batch restore jobs queued');

  return {
    queued: jobIds.length,
    failed: errors.length,
    jobIds,
    errors,
    message: `${jobIds.length} restore(s) queued for processing${errors.length > 0 ? `, ${errors.length} failed to queue` : ''}`
  };
}

/**
 * Queues batch force delete jobs (permanent deletion).
 */
async function queueBatchForceDelete(linkIds, session, correlationId, ip) {
  if (!Array.isArray(linkIds) || linkIds.length === 0) {
    throw new Error('No links selected');
  }

  if (linkIds.length > MAX_BATCH_SIZE) {
    throw new Error(`Maximum ${MAX_BATCH_SIZE} items per batch`);
  }

  const jobIds = [];
  const errors = [];

  for (const linkId of linkIds) {
    try {
      const jobId = await bullQueue.addJob('batch_force_delete', {
        linkId,
        userId: session.userId,
        userRole: session.role,
        correlationId,
        ip
      }, {
        priority: 3, // Higher priority for hard deletes
        maxRetries: 2, // Fewer retries for destructive operations
        queueName: 'batch_operations'
      });

      jobIds.push(jobId);
    } catch (error) {
      logger.error({ linkId, err: error.message }, 'Failed to queue force delete job');
      errors.push({ linkId, error: error.message });
    }
  }

  logger.info({
    totalJobs: jobIds.length,
    failed: errors.length,
    correlationId
  }, 'Batch force delete jobs queued');

  return {
    queued: jobIds.length,
    failed: errors.length,
    jobIds,
    errors,
    message: `${jobIds.length} permanent deletion(s) queued for processing${errors.length > 0 ? `, ${errors.length} failed to queue` : ''}`
  };
}

/**
 * Synchronous fallback for batch soft delete.
 * Used when job queue is unavailable.
 */
async function batchSoftDeleteSync(linkIds, session, correlationId, ip) {
  const results = { success: 0, failed: 0, errors: [] };
  const auditService = container.resolve('auditService');

  for (const linkId of linkIds) {
    try {
      const link = await linkService.getLinkById(linkId, session);
      await linkService.deleteLink(linkId, correlationId);

      await auditService.log({
        action: 'LINK_DELETE_SOFT_BATCH',
        userId: session.userId,
        entityType: 'LINK',
        entityId: linkId,
        details: { file: link.original_name },
        ip,
        correlationId
      });

      results.success++;
    } catch (error) {
      results.failed++;
      results.errors.push({ id: linkId, error: error.message });
    }
  }

  return results;
}

/**
 * Synchronous fallback for batch restore.
 */
async function batchRestoreSync(linkIds, session, correlationId, ip) {
  const results = { success: 0, failed: 0, errors: [] };
  const auditService = container.resolve('auditService');

  for (const linkId of linkIds) {
    try {
      const link = await linkService.getLinkByIdIncludingDeleted(linkId, session);
      await linkService.restoreLink(linkId, correlationId);

      await auditService.log({
        action: 'LINK_RESTORE_BATCH',
        userId: session.userId,
        entityType: 'LINK',
        entityId: linkId,
        details: { file: link.original_name },
        ip,
        correlationId
      });

      results.success++;
    } catch (error) {
      results.failed++;
      results.errors.push({ id: linkId, error: error.message });
    }
  }

  return results;
}

/**
 * Synchronous fallback for batch force delete.
 */
async function batchForceDeleteSync(linkIds, session, correlationId, ip) {
  const results = { success: 0, failed: 0, errors: [] };
  const auditService = container.resolve('auditService');

  for (const linkId of linkIds) {
    try {
      const link = await linkService.getLinkByIdIncludingDeleted(linkId, session);
      await linkService.permanentlyDeleteLink(linkId, correlationId);

      await auditService.log({
        action: 'LINK_DELETE_HARD_BATCH',
        userId: session.userId,
        entityType: 'LINK',
        entityId: linkId,
        details: { file: link.original_name },
        ip,
        correlationId
      });

      results.success++;
    } catch (error) {
      results.failed++;
      results.errors.push({ id: linkId, error: error.message });
    }
  }

  return results;
}

module.exports = {
  registerBatchHandlers,
  queueBatchSoftDelete,
  queueBatchRestore,
  queueBatchForceDelete,
  batchSoftDeleteSync,
  batchRestoreSync,
  batchForceDeleteSync
};
