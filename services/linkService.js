/**
 * Link Service
 */

const { v4: uuidv4 } = require('uuid');
const linkRepository = require('../repositories/linkRepository').instance;
const storageService = require('./storageService');
const { executeTransaction } = require('../db/transaction');
const db = require('../db/database');
const logger = require('../utils/logger');
const { NotFoundError } = require('../utils/AppError');
const config = require('../config');
const { hashPassword } = require('../utils/passwordHash');
const queryCache = require('../utils/queryCache');
const { ERROR_CODES } = require('../constants');

/**
 * Formats an expiry timestamp into a human-readable string for logs.
 */
function formatExpiryLog(timestamp) {
  if (!timestamp) return 'Permanent';
  if (timestamp < Date.now()) return '⚠️ Expired';
  return new Date(timestamp).toLocaleString();
}

/**
 * Retrieves aggregated statistics for the Dashboard.
 */
async function getStats() {
  return queryCache.cacheQuery('dashboard_stats', {}, async () => {
    const stats = await linkRepository.getStats();

    return {
      totalLinks: stats.totalLinks.count || 0,
      activeLinks: stats.activeLinks || 0,
      expiredLinks: stats.expiredLinks || 0,
      totalVisits: stats.counts.totalVisits || 0,
      totalDownloads: stats.counts.totalDownloads || 0,
    };
  }, {
    ttl: 300000, // 5 minutes
    tags: ['links', 'stats']
  });
}

/**
 * Retrieves all active links with pagination and filtering support.
 */
async function getAllLinks(session = {}, options = {}) {
  const {
    page = 1,
    limit = 50,
    search = null,
    status = 'all',
    dateFrom = null,
    dateTo = null
  } = options;
  const offset = (page - 1) * limit;

  const userId = session.role === 'admin' ? null : session.userId;

  const filterOptions = {
    limit,
    offset,
    search,
    status,
    dateFrom,
    dateTo
  };

  const [links, total] = await Promise.all([
    linkRepository.findAll(userId, filterOptions),
    linkRepository.countAll(userId, { search, status, dateFrom, dateTo })
  ]);

  return {
    links,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasNext: page < Math.ceil(total / limit),
      hasPrev: page > 1
    },
    filters: {
      search,
      status,
      dateFrom,
      dateTo
    }
  };
}

/**
 * Retrieves all soft-deleted links (Trash) with pagination and filtering support.
 */
async function getDeletedLinks(session = {}, options = {}) {
  const { page = 1, limit = 50, search = null } = options;
  const offset = (page - 1) * limit;

  const userId = session.role === 'admin' ? null : session.userId;

  const filterOptions = {
    limit,
    offset,
    search
  };

  const [links, total] = await Promise.all([
    linkRepository.findSoftDeleted(userId, filterOptions),
    linkRepository.countSoftDeleted(userId, { search })
  ]);

  return {
    links,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasNext: page < Math.ceil(total / limit),
      hasPrev: page > 1
    },
    filters: {
      search
    }
  };
}

/**
 * Retrieves a specific link by ID.
 */
async function getLinkById(id, session = {}) {
  // Apply ownership scoping: admins can access all links, users only their own
  const userId = session.role === 'admin' ? null : session.userId;
  const link = await linkRepository.findById(id, userId);
  if (!link) throw new NotFoundError('Link not found', ERROR_CODES.LINK_NOT_FOUND);
  return link;
}

/**
 * Retrieves a specific link by ID, including soft-deleted ones.
 * Used for Trash operations (restore/hard delete) where link might already be 'deleted'.
 */
async function getLinkByIdIncludingDeleted(id, session = {}) {
  // Apply ownership scoping: admins can access all links, users only their own
  const userId = session.role === 'admin' ? null : session.userId;
  const link = await linkRepository.findByIdIncludingDeleted(id, userId);
  if (!link) throw new NotFoundError('Link not found', ERROR_CODES.LINK_NOT_FOUND);
  return link;
}

/**
 * Creates a new Link Record.
 *
 * Creates a database entry for an uploaded file, generates short ID if landing page is enabled,
 * and handles password hashing. If database insertion fails, automatically cleans up the orphaned file.
 */
async function createLink(fileStub, data, extraData, correlationId) {
  const { expiryTimestamp, hasLandingPage } = data;
  const shortId = hasLandingPage ? uuidv4().substring(0, 8) : null;
  const finalExpiry = expiryTimestamp === undefined ? null : expiryTimestamp;

  // Hash password if provided
  let passwordHash = null;
  if (extraData.password) {
    passwordHash = await hashPassword(extraData.password);
  }

  const newLink = {
    id: uuidv4(),
    short_id: shortId,
    filename: fileStub.filename,
    original_name: fileStub.originalname,
    expires_at: finalExpiry,
    created_at: Date.now(),
    has_landing_page: hasLandingPage,
    visit_count: 0,
    download_count: 0,

    // Feature Flags
    burn_after_read: !!extraData.burnAfterRead,
    password_hash: passwordHash,
    file_checksum: extraData.checksum || null,
    is_encrypted: !!extraData.isEncrypted
  };

  try {
    await executeTransaction(async (trx) => {
      await linkRepository.create(newLink, trx);
    });
  } catch (error) {
    // If DB insert fails, delete the orphaned file immediately
    await storageService.delete(fileStub.filename).catch(err =>
      logger.error({ reqId: correlationId, err }, 'Failed to cleanup file after DB error')
    );
    throw error;
  }

  logger.info({
      reqId: correlationId,
      action: 'CREATE',
      details: {
        id: newLink.id,
        file: newLink.original_name,
        expiry: formatExpiryLog(newLink.expires_at),
        landingPage: newLink.has_landing_page ? `Enabled` : 'Disabled',
        burnAfterRead: newLink.burn_after_read,
        protection: !!newLink.password_hash
      },
    }, 'Link Created');

  // Invalidate stats cache after creating a new link
  queryCache.invalidateByTag('stats');

  return newLink;
}

/**
 * Updates an existing Link.
 *
 * Allows updating link configuration including expiration, landing page, password,
 * and file replacement. Handles storage cleanup for replaced files and generates/removes
 * short IDs based on landing page toggle.
 */
async function updateLink(id, fileStub, data, extraData, correlationId) {
  const link = await linkRepository.findById(id);
  if (!link) throw new NotFoundError('Link not found', ERROR_CODES.LINK_NOT_FOUND);

  const oldFileName = link.original_name || 'Unknown File';
  const oldStorageKey = link.filename;
  const { expiryTimestamp, hasLandingPage } = data;

  const updatePayload = {
    has_landing_page: hasLandingPage,
    burn_after_read: !!extraData.burnAfterRead
  };

  if (expiryTimestamp !== undefined) updatePayload.expires_at = expiryTimestamp;

  // Only update password if a new one is provided (non-empty)
  if (extraData.password && extraData.password.trim() !== '') {
    updatePayload.password_hash = await hashPassword(extraData.password);
  }

  // Generate/Remove Short ID based on Landing Page toggle
  if (hasLandingPage && !link.short_id) {
    updatePayload.short_id = uuidv4().substring(0, 8);
  } else if (!hasLandingPage) {
    updatePayload.short_id = null;
  }

  let newFileName = 'No';

  await executeTransaction(async (trx) => {
    // If file is replaced, update metadata
    if (fileStub) {
      updatePayload.filename = fileStub.filename;
      updatePayload.original_name = fileStub.originalname;

      // Update metadata
      if (extraData.checksum) updatePayload.file_checksum = extraData.checksum;
      updatePayload.is_encrypted = !!extraData.isEncrypted;

      newFileName = fileStub.originalname;
    }
    await linkRepository.update(id, updatePayload, trx);
  });

  // Delete old physical file ONLY after successful DB update
  if (fileStub && oldStorageKey) {
    try {
      await storageService.delete(oldStorageKey);
    } catch (err) {
      logger.error({ reqId: correlationId, err }, 'Failed to delete old file after update - scheduling retry');

      // Schedule retry by adding to failed_file_deletions table
      try {
        await db('failed_file_deletions').insert({
          id: uuidv4(),
          storage_key: oldStorageKey,
          link_id: id,
          provider: config.storage.provider,
          error_message: err.message,
          retry_count: 0,
          created_at: Date.now()
        });
      } catch (dbErr) {
        logger.error({ reqId: correlationId, err: dbErr }, 'Failed to schedule file deletion retry');
      }
    }
  }

  logger.info({
      reqId: correlationId,
      action: 'UPDATE',
      details: {
        id: id,
        originalFile: oldFileName,
        newFile: newFileName,
        burnAfterRead: updatePayload.burn_after_read,
        newExpiry: formatExpiryLog(expiryTimestamp !== undefined ? updatePayload.expires_at : link.expires_at),
      },
    }, 'Link Updated');

  // Invalidate stats cache after updating a link
  queryCache.invalidateByTag('stats');

  return { ...link, ...updatePayload };
}

/**
 * Soft Deletes a link (Moves to Trash).
 *
 * Marks link as deleted by setting deleted_at timestamp. The link and file
 * remain in the system and can be restored later. Physical file deletion
 * occurs via garbage collector after retention period.
 */
async function deleteLink(id, correlationId) {
  const link = await linkRepository.findById(id);
  if (!link) throw new NotFoundError('Link not found', ERROR_CODES.LINK_NOT_FOUND);

  await executeTransaction(async (trx) => {
    await linkRepository.delete(id, trx);
  });

  logger.info({
      reqId: correlationId,
      action: 'DELETE',
      details: { id: link.id, file: link.original_name },
    }, 'Link Soft Deleted');

  // Invalidate stats cache after soft deleting a link
  queryCache.invalidateByTag('stats');

  return true;
}

/**
 * Restores a link from the Trash.
 *
 * Removes the deleted_at timestamp, making the link active again.
 * The link and file become accessible as they were before deletion.
 */
async function restoreLink(id, correlationId) {
  const link = await linkRepository.findByIdIncludingDeleted(id);
  if (!link) throw new NotFoundError('Link not found', ERROR_CODES.LINK_NOT_FOUND);

  await executeTransaction(async (trx) => {
    await linkRepository.restore(id, trx);
  });

  logger.info({ reqId: correlationId, action: 'UPDATE', details: { id: link.id, file: link.original_name, status: 'Restored' } }, 'Link Restored');

  // Invalidate stats cache after restoring a link
  queryCache.invalidateByTag('stats');

  return true;
}

/**
 * Permanently deletes a link (Hard Delete).
 * Removes physical file immediately.
 */
async function permanentlyDeleteLink(id, correlationId) {
  const link = await linkRepository.findByIdIncludingDeleted(id);
  if (!link) throw new NotFoundError('Link not found', ERROR_CODES.LINK_NOT_FOUND);

  // Remove file from storage (S3/Azure/Disk)
  try {
    await storageService.delete(link.filename);
  } catch (err) {
    logger.error({ reqId: correlationId, err }, 'Failed to delete file during manual hard delete');
  }

  // Remove DB row
  await executeTransaction(async (trx) => {
    await linkRepository.hardDelete(id, trx);
  });

  logger.info({
      reqId: correlationId,
      action: 'DELETE',
      details: { id: link.id, file: link.original_name },
    }, 'Link Permanently Deleted');

  // Invalidate stats cache after permanently deleting a link
  queryCache.invalidateByTag('stats');

  return true;
}

/**
 * Finds a link by public short ID.
 * Increments visit count.
 */
async function getLinkByShortId(shortId) {
  const link = await linkRepository.findByShortId(shortId);
  if (!link) return null;
  await linkRepository.incrementCounter(link.id, 'visit_count');

  // Invalidate stats cache after incrementing visit count
  queryCache.invalidateByTag('stats');

  return link;
}

/**
 * Finds a link by UUID for downloading.
 * Increments download count.
 */
async function getLinkByIdForDownload(id) {
  const link = await linkRepository.findById(id);
  if (!link) return null;
  await linkRepository.incrementCounter(link.id, 'download_count');

  // Invalidate stats cache after incrementing download count
  queryCache.invalidateByTag('stats');

  return link;
}

/**
 * System Task: Garbage Collection.
 * Identifies links that are Expired OR Soft-Deleted past the retention period.
 * Permanently removes them and their files.
 */
async function processCleanup() {
  const retentionDays = config.trashRetentionDays;
  const cutoffDate = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);

  // Configuration for batch processing
  const BATCH_SIZE = 100; // Process 100 items at a time
  const MAX_ITEMS_PER_RUN = 1000; // Maximum items to process in one cleanup run
  const PARALLEL_DELETIONS = 10; // Process up to 10 storage deletions concurrently

  // Get total count for progress tracking
  const totalGarbage = await linkRepository.countGarbage(cutoffDate);

  if (totalGarbage === 0) {
    logger.info('🧹 [CLEANUP] No items to purge.');
    return;
  }

  logger.info(`🧹 [CLEANUP] Found ${totalGarbage} items to purge. Processing in batches...`);

  let processedCount = 0;
  let successCount = 0;
  let failureCount = 0;
  let offset = 0;

  // Process in batches until we reach max items or no more items
  while (processedCount < MAX_ITEMS_PER_RUN && offset < totalGarbage) {
    const batch = await linkRepository.findGarbage(cutoffDate, {
      limit: BATCH_SIZE,
      offset: offset
    });

    if (batch.length === 0) break;

    logger.info(`   Processing batch: ${offset + 1}-${offset + batch.length} of ${Math.min(totalGarbage, MAX_ITEMS_PER_RUN)}`);

    // Process storage deletions in parallel chunks
    const successfulDeletions = [];
    const failedDeletions = [];

    // Split batch into smaller chunks for parallel processing
    for (let i = 0; i < batch.length; i += PARALLEL_DELETIONS) {
      const chunk = batch.slice(i, i + PARALLEL_DELETIONS);

      // Delete files from storage in parallel using Promise.allSettled
      const deletionResults = await Promise.allSettled(
        chunk.map(item =>
          storageService.delete(item.filename)
            .then(() => ({ success: true, item }))
            .catch(err => ({ success: false, item, error: err }))
        )
      );

      // Separate successful and failed deletions
      deletionResults.forEach(result => {
        if (result.status === 'fulfilled') {
          const { success, item, error } = result.value;
          if (success) {
            successfulDeletions.push(item);
          } else {
            failedDeletions.push({ item, error });
          }
        } else {
          // Promise itself rejected
          logger.error({ err: result.reason }, 'Unexpected promise rejection in cleanup');
        }
      });
    }

    // Batch delete successful items from database in a single transaction
    if (successfulDeletions.length > 0) {
      try {
        await executeTransaction(async (trx) => {
          const idsToDelete = successfulDeletions.map(item => item.id);

          // Batch delete using WHERE IN clause
          await trx('links').whereIn('id', idsToDelete).delete();
        });

        successCount += successfulDeletions.length;

        // Log successful deletions (only in debug mode to avoid log spam)
        if (successfulDeletions.length > 0) {
          logger.debug(`   - Purged ${successfulDeletions.length} items in batch`);
        }
      } catch (dbErr) {
        // If batch database deletion fails, fall back to individual deletions
        logger.warn({ err: dbErr }, 'Batch database deletion failed, falling back to individual deletes');

        for (const item of successfulDeletions) {
          try {
            await executeTransaction(async (trx) => {
              await linkRepository.hardDelete(item.id, trx);
            });
            successCount++;
          } catch (err) {
            logger.error({ err, itemId: item.id }, 'Failed to delete from database after successful storage deletion');
            failedDeletions.push({ item, error: err });
          }
        }
      }
    }

    // Handle failed deletions - queue them for retry
    if (failedDeletions.length > 0) {
      failureCount += failedDeletions.length;

      for (const { item, error } of failedDeletions) {
        logger.error({ err: error, itemId: item.id, filename: item.filename }, 'Error during garbage collection');

        // Queue failed deletion for retry via job queue
        try {
          const jobQueue = require('../jobs/jobQueue');
          jobQueue.addJob('file_deletion', {
            storageKey: item.filename,
            linkId: item.id
          }, { priority: 'low', maxRetries: 3 });
        } catch (queueErr) {
          logger.error({ err: queueErr, itemId: item.id }, 'Failed to queue file deletion retry');
        }
      }
    }

    processedCount += batch.length;
    offset += BATCH_SIZE;

    // If we processed fewer items than the batch size
    if (batch.length < BATCH_SIZE) break;
  }

  logger.info(`🧹 [CLEANUP] Completed: ${successCount} purged, ${failureCount} failed, ${totalGarbage - processedCount} remaining`);

  // Invalidate stats cache after cleanup
  queryCache.invalidateByTag('stats');
}

module.exports = {
  getStats,
  getAllLinks,
  getDeletedLinks,
  getLinkById,
  getLinkByIdIncludingDeleted,
  createLink,
  updateLink,
  deleteLink,
  restoreLink,
  permanentlyDeleteLink,
  getLinkByShortId,
  getLinkByIdForDownload,
  processCleanup
};
