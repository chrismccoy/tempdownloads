/**
 * Admin API Controller.
 *
 * Handles all background API requests for the Admin Dashboard.
 */

const asyncHandler = require('express-async-handler');
const container = require('../container');
const auditLog = require('../middleware/auditLog');
const ApiResponse = require('../utils/apiResponse');
const { generateStorageKey } = require('../utils/fileSanitizer');

// Resolve dependencies from container
const linkService = container.resolve('linkService');
const storageService = container.resolve('storageService');
const uploadService = container.resolve('uploadService');

/**
 * Generates a Direct Upload
 */
const getUploadIntent = asyncHandler(async (req, res) => {
  const { filename, mimetype } = req.body;
  const uniqueKey = generateStorageKey(filename);
  const uploadData = await storageService.getUploadUrl(uniqueKey, mimetype);

  ApiResponse.success(res, 'Upload initialized', uploadData);
});

/**
 * Handles Local File Uploads via Busboy Streaming.
 */
const uploadLocal = asyncHandler(async (req, res) => {
  try {
    const result = await uploadService.handleLocalUpload(req);
    ApiResponse.success(res, 'File uploaded', result);
  } catch (error) {
    ApiResponse.error(res, error.message || 'Upload failed', 400);
  }
});

/**
 * Finalizes the creation of a Download Link.
 */
const createLink = asyncHandler(async (req, res) => {
  const { key, original_name, password, burn_after_read, checksum, is_encrypted } = req.body;
  if (!key || !original_name) return ApiResponse.error(res, 'Missing file metadata', 400);

  const fileStub = { filename: key, originalname: original_name };
  const extraData = {
    password,
    burnAfterRead: burn_after_read === 'on' || burn_after_read === true,
    checksum,
    isEncrypted: is_encrypted === true
  };

  const link = await linkService.createLink(fileStub, req.body, extraData, req.correlationId);

  await auditLog.log(req, 'LINK_CREATE', 'LINK', link.id, {
    file: original_name,
    burnAfterRead: extraData.burnAfterRead,
    protection: !!link.password_hash
  });

  ApiResponse.success(res, 'Link created', { redirectTo: '/admin/links' }, 201);
});

/**
 * Updates an existing Download Link.
 */
const updateLink = asyncHandler(async (req, res) => {
  const { key, original_name, password, burn_after_read, checksum, is_encrypted } = req.body;

  let fileStub = null;
  if (key && original_name) {
    fileStub = { filename: key, originalname: original_name };
  }

  const extraData = {
    password,
    burnAfterRead: burn_after_read === 'on' || burn_after_read === true,
    checksum,
    isEncrypted: is_encrypted === true
  };

  const updatedLink = await linkService.updateLink(req.params.id, fileStub, req.body, extraData, req.correlationId);

  await auditLog.log(req, 'LINK_UPDATE', 'LINK', req.params.id, {
    originalFile: updatedLink.original_name,
    fileReplaced: !!fileStub,
    burnAfterRead: updatedLink.burn_after_read,
    protection: !!updatedLink.password_hash
  });

  ApiResponse.success(res, 'Link updated', { redirectTo: '/admin/links' });
});

/**
 * Soft Deletes a link (Move to Trash).
 */
const deleteLink = asyncHandler(async (req, res) => {
  // Fetch link details BEFORE deletion for the audit log
  // Pass session for ownership scoping - users can only delete their own links
  const link = await linkService.getLinkById(req.params.id, req.session);

  await linkService.deleteLink(req.params.id, req.correlationId);

  await auditLog.log(req, 'LINK_DELETE_SOFT', 'LINK', req.params.id, {
    file: link.original_name
  });

  ApiResponse.success(res, 'Moved to trash');
});

/**
 * Restores a link from Trash.
 */
const restoreLink = asyncHandler(async (req, res) => {
  // Fetch link details BEFORE restore for the audit log
  // Pass session for ownership scoping - users can only restore their own links
  const link = await linkService.getLinkByIdIncludingDeleted(req.params.id, req.session);

  await linkService.restoreLink(req.params.id, req.correlationId);

  await auditLog.log(req, 'LINK_RESTORE', 'LINK', req.params.id, {
    file: link.original_name
  });

  ApiResponse.success(res, 'Restored successfully');
});

/**
 * Permanently deletes a link and its file (Hard Delete).
 */
const hardDeleteLink = asyncHandler(async (req, res) => {
  // Fetch link details BEFORE deletion for the audit log
  // Pass session for ownership scoping - users can only permanently delete their own links
  const link = await linkService.getLinkByIdIncludingDeleted(req.params.id, req.session);

  await linkService.permanentlyDeleteLink(req.params.id, req.correlationId);

  await auditLog.log(req, 'LINK_DELETE_HARD', 'LINK', req.params.id, {
    file: link.original_name
  });

  ApiResponse.success(res, 'Permanently deleted');
});

/**
 * Generates a QR Code for a given URL.
 */
const generateQr = asyncHandler(async (req, res) => {
  const QRCode = require('qrcode');
  const url = req.query.url;

  if(!url) return ApiResponse.error(res, 'Missing URL', 400);

  const qrData = await QRCode.toDataURL(url);
  ApiResponse.success(res, 'QR Generated', { dataUrl: qrData });
});

/**
 * Batch Delete Links (Move to Trash).
 * Uses job queue for asynchronous processing with backpressure control.
 */
const batchDelete = asyncHandler(async (req, res) => {
  const { ids } = req.body;
  const batchService = require('../services/batchService');

  // Validation
  if (!Array.isArray(ids) || ids.length === 0) {
    return ApiResponse.validationError(res, 'No links selected');
  }
  if (ids.length > 100) {
    return ApiResponse.validationError(res, 'Maximum 100 items per batch');
  }

  try {
    // Queue jobs for asynchronous processing
    const result = await batchService.queueBatchSoftDelete(
      ids,
      req.session,
      req.correlationId,
      req.ip
    );

    ApiResponse.success(res, result.message, {
      queued: result.queued,
      failed: result.failed,
      jobIds: result.jobIds,
      errors: result.errors
    });
  } catch (error) {
    // Fallback to synchronous processing if queue fails
    logger.warn({ err: error.message }, 'Batch queue unavailable, using synchronous processing');

    const results = await batchService.batchSoftDeleteSync(
      ids,
      req.session,
      req.correlationId,
      req.ip
    );

    const message = `${results.success} item(s) moved to trash${results.failed > 0 ? `, ${results.failed} failed` : ''}`;
    ApiResponse.success(res, message, results);
  }
});

/**
 * Batch Restore Links from Trash.
 * Uses job queue for asynchronous processing with backpressure control.
 */
const batchRestore = asyncHandler(async (req, res) => {
  const { ids } = req.body;
  const batchService = require('../services/batchService');

  // Validation
  if (!Array.isArray(ids) || ids.length === 0) {
    return ApiResponse.validationError(res, 'No links selected');
  }
  if (ids.length > 100) {
    return ApiResponse.validationError(res, 'Maximum 100 items per batch');
  }

  try {
    // Queue jobs for asynchronous processing
    const result = await batchService.queueBatchRestore(
      ids,
      req.session,
      req.correlationId,
      req.ip
    );

    ApiResponse.success(res, result.message, {
      queued: result.queued,
      failed: result.failed,
      jobIds: result.jobIds,
      errors: result.errors
    });
  } catch (error) {
    // Fallback to synchronous processing if queue fails
    logger.warn({ err: error.message }, 'Batch queue unavailable, using synchronous processing');

    const results = await batchService.batchRestoreSync(
      ids,
      req.session,
      req.correlationId,
      req.ip
    );

    const message = `${results.success} item(s) restored${results.failed > 0 ? `, ${results.failed} failed` : ''}`;
    ApiResponse.success(res, message, results);
  }
});

/**
 * Batch Permanently Delete Links.
 * Uses job queue for asynchronous processing with backpressure control.
 */
const batchForceDelete = asyncHandler(async (req, res) => {
  const { ids } = req.body;
  const batchService = require('../services/batchService');

  // Validation
  if (!Array.isArray(ids) || ids.length === 0) {
    return ApiResponse.validationError(res, 'No links selected');
  }
  if (ids.length > 100) {
    return ApiResponse.validationError(res, 'Maximum 100 items per batch');
  }

  try {
    // Queue jobs for asynchronous processing
    const result = await batchService.queueBatchForceDelete(
      ids,
      req.session,
      req.correlationId,
      req.ip
    );

    ApiResponse.success(res, result.message, {
      queued: result.queued,
      failed: result.failed,
      jobIds: result.jobIds,
      errors: result.errors
    });
  } catch (error) {
    // Fallback to synchronous processing if queue fails
    logger.warn({ err: error.message }, 'Batch queue unavailable, using synchronous processing');

    const results = await batchService.batchForceDeleteSync(
      ids,
      req.session,
      req.correlationId,
      req.ip
    );

    const message = `${results.success} item(s) permanently deleted${results.failed > 0 ? `, ${results.failed} failed` : ''}`;
    ApiResponse.success(res, message, results);
  }
});

module.exports = {
  getUploadIntent,
  uploadLocal,
  createLink,
  updateLink,
  deleteLink,
  restoreLink,
  hardDeleteLink,
  generateQr,
  batchDelete,
  batchRestore,
  batchForceDelete
};
