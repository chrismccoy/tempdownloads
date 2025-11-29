/**
 * Batch Job Handlers for BullMQ.
 *
 * Provides job handlers for batch operations (delete, restore, force delete).
 * Jobs are processed asynchronously with control via BullMQ concurrency limits.
 */

const linkService = require('../services/linkService');
const container = require('../container');
const logger = require('../utils/logger');

/**
 * Job handler for batch soft delete (move to trash).
 */
async function batchSoftDeleteHandler(job) {
  const { linkId, userId, correlationId, ip, userRole } = job.data;
  const auditService = container.resolve('auditService');

  try {
    // Fetch link details before deletion with ownership scoping
    const session = { userId, role: userRole };
    const link = await linkService.getLinkById(linkId, session);

    // Perform soft delete
    await linkService.deleteLink(linkId, correlationId);

    // Audit log
    await auditService.log({
      action: 'LINK_DELETE_SOFT_BATCH',
      userId,
      entityType: 'LINK',
      entityId: linkId,
      details: { file: link.original_name },
      ip,
      correlationId
    });

    logger.info({
      jobId: job.id,
      linkId,
      filename: link.original_name
    }, 'Batch soft delete completed');

    return { success: true, linkId, filename: link.original_name };

  } catch (error) {
    logger.error({
      jobId: job.id,
      linkId,
      err: error.message
    }, 'Batch soft delete failed');

    throw error; // Re-throw to trigger BullMQ retry
  }
}

/**
 * Job handler for batch restore from trash.
 */
async function batchRestoreHandler(job) {
  const { linkId, userId, correlationId, ip, userRole } = job.data;
  const auditService = container.resolve('auditService');

  try {
    // Fetch link details before restore with ownership scoping
    const session = { userId, role: userRole };
    const link = await linkService.getLinkByIdIncludingDeleted(linkId, session);

    // Perform restore
    await linkService.restoreLink(linkId, correlationId);

    // Audit log
    await auditService.log({
      action: 'LINK_RESTORE_BATCH',
      userId,
      entityType: 'LINK',
      entityId: linkId,
      details: { file: link.original_name },
      ip,
      correlationId
    });

    logger.info({
      jobId: job.id,
      linkId,
      filename: link.original_name
    }, 'Batch restore completed');

    return { success: true, linkId, filename: link.original_name };

  } catch (error) {
    logger.error({
      jobId: job.id,
      linkId,
      err: error.message
    }, 'Batch restore failed');

    throw error;
  }
}

/**
 * Job handler for batch permanent delete (hard delete).
 */
async function batchForceDeleteHandler(job) {
  const { linkId, userId, correlationId, ip, userRole } = job.data;
  const auditService = container.resolve('auditService');

  try {
    // Fetch link details before deletion with ownership scoping
    const session = { userId, role: userRole };
    const link = await linkService.getLinkByIdIncludingDeleted(linkId, session);

    // Perform permanent delete
    await linkService.permanentlyDeleteLink(linkId, correlationId);

    // Audit log
    await auditService.log({
      action: 'LINK_DELETE_HARD_BATCH',
      userId,
      entityType: 'LINK',
      entityId: linkId,
      details: { file: link.original_name },
      ip,
      correlationId
    });

    logger.info({
      jobId: job.id,
      linkId,
      filename: link.original_name
    }, 'Batch force delete completed');

    return { success: true, linkId, filename: link.original_name };

  } catch (error) {
    logger.error({
      jobId: job.id,
      linkId,
      err: error.message
    }, 'Batch force delete failed');

    throw error;
  }
}

module.exports = {
  batchSoftDeleteHandler,
  batchRestoreHandler,
  batchForceDeleteHandler
};
