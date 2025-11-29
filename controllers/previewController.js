/**
 * File Preview Controller
 *
 * Handles file preview functionality for supported file types.
 */

const asyncHandler = require('express-async-handler');
const linkService = require('../services/linkService');
const storageService = require('../services/storageService');
const { canPreview, getContentHeaders } = require('../utils/filePreview');
const { NotFoundError } = require('../utils/AppError');
const logger = require('../utils/logger');

/**
 * Renders the preview page for a file.
 */
const renderPreviewPage = asyncHandler(async (req, res) => {
  const { shortId } = req.params;

  // Get link by short ID
  const link = await linkService.getLinkByShortId(shortId);

  if (!link) {
    throw new NotFoundError('Link not found or has expired');
  }

  // Check if expired
  if (link.expires_at && link.expires_at < Date.now()) {
    throw new NotFoundError('This link has expired');
  }

  // Check if file can be previewed
  const stats = await storageService.getStats(link.filename).catch(() => null);
  const fileSize = stats ? stats.size : null;
  const previewCheck = canPreview(link.original_name, fileSize);

  if (!previewCheck.canPreview) {
    return res.status(400).send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Preview Not Available</title>
          <style>
            body { font-family: monospace; padding: 40px; text-align: center; }
            .error { color: #dc2626; font-weight: bold; }
          </style>
        </head>
        <body>
          <h1>Preview Not Available</h1>
          <p class="error">${previewCheck.reason}</p>
          <p><a href="/download/${shortId}">Download File Instead</a></p>
        </body>
      </html>
    `);
  }

  // Render preview page
  res.render('public/preview', {
    title: `Preview: ${link.original_name}`,
    link,
    previewType: previewCheck.previewType,
    csrfToken: req.csrfToken()
  });
});

/**
 * Streams the file content for preview (inline disposition).
 */
const streamPreview = asyncHandler(async (req, res) => {
  const { shortId } = req.params;

  // Get link by short ID
  const link = await linkService.getLinkByShortId(shortId);

  if (!link) {
    throw new NotFoundError('Link not found or has expired');
  }

  // Check if expired
  if (link.expires_at && link.expires_at < Date.now()) {
    throw new NotFoundError('This link has expired');
  }

  // Check if file can be previewed
  const stats = await storageService.getStats(link.filename).catch(() => null);
  const fileSize = stats ? stats.size : null;
  const previewCheck = canPreview(link.original_name, fileSize);

  if (!previewCheck.canPreview) {
    return res.status(400).json({
      error: previewCheck.reason
    });
  }

  // Get content headers for inline display
  const headers = getContentHeaders(link.original_name, true);

  // Set headers
  res.set(headers);

  // Add cache control for preview
  res.set('Cache-Control', 'private, max-age=3600');

  // Stream the file
  try {
    const stream = await storageService.getStream(link.filename);

    // Handle stream errors
    stream.on('error', (err) => {
      logger.error({ err, linkId: link.id }, 'Error streaming file for preview');
      if (!res.headersSent) {
        res.status(500).send('Error streaming file');
      }
    });

    // Pipe to response
    stream.pipe(res);
  } catch (error) {
    logger.error({ err: error, linkId: link.id }, 'Error getting file stream for preview');
    throw error;
  }
});

module.exports = {
  renderPreviewPage,
  streamPreview
};
