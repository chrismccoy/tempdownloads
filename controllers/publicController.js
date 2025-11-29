/**
 * Public Controller.
 */

const asyncHandler = require('express-async-handler');
const linkService = require('../services/linkService');
const storageService = require('../services/storageService');
const auditLog = require('../middleware/auditLog');
const jobQueue = require('../jobs/bullQueue');
const { decrypt, encrypt } = require('../utils/encryption');
const { formatBytes, getFileExtension } = require('../utils/formatting');
const { pipeWithErrorHandling, pipeWithChecksumVerification } = require('../utils/streamHelper');
const { canPreview } = require('../utils/filePreview');
const logger = require('../utils/logger');
const { NotFoundError, AppError } = require('../utils/AppError');
const { verifyPassword } = require('../utils/passwordHash');
const { COOKIES, TIMEOUTS, ERROR_CODES } = require('../constants');

/**
 * Renders the Public Landing Page for a download link.
 */
const renderLandingPage = asyncHandler(async (req, res) => {
  const link = await linkService.getLinkByShortId(req.params.shortId);

  if (!link) throw new NotFoundError('Download link not found.', ERROR_CODES.LINK_NOT_FOUND);

  const isExpired = link.expires_at && link.expires_at < Date.now();

  // Prevent caching of the landing page if it's a "Burn on Read" link.
  // This ensures that if the user downloads it and hits "Back", the page reloads and shows 404.
  if (link.burn_after_read) {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  }

  // Log the visit in the Audit Trail
  await auditLog.log(req, 'LINK_VISIT', 'LINK', link.id, {
    userAgent: req.get('User-Agent')
  });

  // Password Protection
  // If protected AND user hasn't unlocked it in this session yet -> Show Password Form
  if (link.password_hash && !req.session[`auth_${link.id}`]) {
    return res.render('public/password', {
      title: 'Protected Download',
      shortId: req.params.shortId,
      error: null
    });
  }

  // Fetch File Stats (Size) from Storage
  let stats = { size: 0 };
  try {
    stats = await storageService.getStats(link.filename);
  } catch (error) {
    logger.warn({ reqId: req.correlationId, err: error }, 'File missing from storage');
  }

  // Check if file can be previewed
  const previewCheck = canPreview(link.original_name, stats.size);

  // Prepare View Model
  const viewModel = {
    original_name: link.original_name,
    short_id: link.short_id,
    file_extension: getFileExtension(link.original_name),
    file_size: formatBytes(stats.size),
    expires_at: link.expires_at,
    is_expired: isExpired,
    burn_after_read: link.burn_after_read,
    can_preview: previewCheck.canPreview,
    preview_type: previewCheck.previewType,
    // Generate encrypted token for the "Download" button
    token: encrypt({
      id: link.id,
      exp: link.expires_at,
      pwhash: link.password_hash ? '1' : '0'
    })
  };

  res.render('public/download', {
    title: link.original_name,
    link: viewModel
  });
});

/**
 * Verifies the password for a protected download link.
 *
 * If successful, sets a session flag (`auth_{LINK_ID}`) to authorize future access.
 */
const verifyLinkPassword = asyncHandler(async (req, res) => {
  const { password } = req.body;
  const link = await linkService.getLinkByShortId(req.params.shortId);

  if (!link) throw new NotFoundError('Link not found', ERROR_CODES.LINK_NOT_FOUND);

  // Verify Password Hash
  const match = await verifyPassword(password, link.password_hash);

  if (match) {
    // Success: Set Session Authorization
    req.session[`auth_${link.id}`] = true;
    return res.redirect(`/download/${req.params.shortId}`);
  } else {
    // Failure: Re-render form with error
    return res.render('public/password', {
      title: 'Protected Download',
      shortId: req.params.shortId,
      error: 'Incorrect Password'
    });
  }
});

/**
 * Processes a Direct File Download.
 *
 * Validates the Encrypted Token, Authorization, and Expiration.
 * Redirects to Cloud Storage OR Streams from Local Disk.
 * Triggers "Burn-on-Read" deletion if enabled.
 */
const processDownload = asyncHandler(async (req, res) => {
  // Decrypt Token
  const payload = decrypt(req.params.token);

  if (!payload || !payload.id) {
    throw new AppError('Invalid or tampered download token.', 403, ERROR_CODES.FORBIDDEN);
  }

  if (payload.exp && payload.exp < Date.now()) {
    throw new AppError('This link has expired.', 410, ERROR_CODES.LINK_EXPIRED);
  }

  // Fetch Link Details
  const link = await linkService.getLinkByIdForDownload(payload.id);
  if (!link) throw new NotFoundError('File has been removed.', ERROR_CODES.LINK_NOT_FOUND);

  // Check Password Authorization (if direct link is shared without unlocking)
  if (link.password_hash && !req.session[`auth_${link.id}`]) {
     // If they accessed /d/TOKEN directly, force them to the Landing Page to enter password.
     // If there is no landing page, throw Forbidden.
     if(link.has_landing_page) {
       return res.redirect(`/download/${link.short_id}`);
     } else {
       throw new AppError('Password authentication required via landing page.', 403, ERROR_CODES.INVALID_PASSWORD);
     }
  }

  logger.info({
    reqId: req.correlationId,
    action: 'DOWNLOAD',
    details: { file: link.original_name }
  }, 'Download Initiated');

  // Serve File
  try {
    const downloadUrl = await storageService.getDownloadUrl(link.filename);

    if (downloadUrl) {
      // S3 / Azure -> Redirect User to Presigned URL
      res.redirect(downloadUrl);

      logger.info({
        reqId: req.correlationId,
        action: 'DOWNLOAD_SUCCESS',
        details: {
          linkId: link.id,
          file: link.original_name,
          provider: 'cloud_redirect'
        }
      }, 'Download completed (cloud redirect)');
    } else {
      // Local Storage -> Stream File directly with checksum verification
      const fileStream = await storageService.getStream(link.filename);

      res.setHeader('Content-Disposition', `attachment; filename="${link.original_name}"`);
      res.setHeader('Content-Type', 'application/octet-stream');

      // Stream file with checksum verification and error handling
      // Verifies file integrity during download to detect corruption/tampering
      await pipeWithChecksumVerification(fileStream, res, link.file_checksum, {
        operation: 'file download',
        correlationId: req.correlationId,
        timeout: 60000 // 60 seconds for large files
      }).catch(err => {
        // If headers not sent, we can still send error response
        if (!res.headersSent) {
          throw new AppError('Download failed', 500, ERROR_CODES.STORAGE_ERROR);
        }
        // Otherwise just log the error
        logger.error({
          reqId: req.correlationId,
          linkId: link.id,
          err
        }, 'Download pipe error after headers sent');
      });

      logger.info({
        reqId: req.correlationId,
        action: 'DOWNLOAD_SUCCESS',
        details: {
          linkId: link.id,
          file: link.original_name,
          provider: 'local_stream'
        }
      }, 'Download completed (local stream)');
    }

    // Execute Burn-on-Read Logic
    if (link.burn_after_read) {
      logger.info(`🔥 [BURN] Link ${link.id} marked for self-destruction.`);

      // Queue deletion via job queue for reliability with retries
      // Uses high priority to ensure prompt deletion after download
      try {
        await jobQueue.addJob('burn_deletion', {
          linkId: link.id,
          correlationId: req.correlationId,
          storageKey: link.filename
        }, {
          priority: 'high',
          maxRetries: 3
        });

        logger.info({
          linkId: link.id,
          reqId: req.correlationId
        }, '🔥 [BURN] Deletion queued successfully');
      } catch (err) {
        // If queueing fails, log error but don't block download
        logger.error({
          linkId: link.id,
          reqId: req.correlationId,
          err
        }, '❌ [BURN] Failed to queue deletion - will retry in cleanup job');
      }
    }

  } catch (error) {
    logger.error({ reqId: req.correlationId, err: error }, 'Download Failed');
    if (!res.headersSent) {
      throw new NotFoundError('File missing on storage server.');
    } else {
      res.end();
    }
  }
});

/**
 * CSP Report Handler.
 *
 * Endpoint for browsers to send JSON reports about Content Security Policy violations.
 * Logs them as Warnings for admin review.
 */
const handleCspReport = (req, res) => {
  if (req.body) {
    logger.warn({ cspViolation: req.body }, '🛡️ CSP Violation Reported');
  }
  // Always return 204 No Content to the browser
  res.status(204).end();
};

module.exports = { renderLandingPage, verifyLinkPassword, processDownload, handleCspReport };
