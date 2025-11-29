/**
 * Public Route Definitions.
 *
 * Contains routes accessible without authentication (Guest).
 * Handles:
 * - Landing Pages
 * - Authentication (Login/Register)
 * - File Downloads
 * - System Health & Reporting
 */

const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');
const validate = require('../middleware/validate');
const { loginSchema, registerSchema, tokenParamSchema, shortIdParamSchema } = require('../schemas/appSchemas');
const { loginLimiter } = require('../middleware/security');
const linkPasswordLimiter = require('../middleware/linkPasswordRateLimiter');
const downloadRateLimiter = require('../middleware/downloadRateLimiter');
const authController = require('../controllers/authController');
const passwordResetController = require('../controllers/passwordResetController');
const publicController = require('../controllers/publicController');
const previewController = require('../controllers/previewController');
const db = require('../db/database');
const storageService = require('../services/storageService');

/**
 * Returns a fresh CSRF token for client-side JavaScript.
 * Useful for SPA/AJAX applications that need tokens without page reload.
 */
router.get('/api/csrf-token', (req, res) => {
  res.json({
    success: true,
    data: {
      csrfToken: res.locals.csrfToken
    }
  });
});

/**
 * Receives CSP violation reports from browsers.
 */
router.post('/api/csp-report', publicController.handleCspReport);

/**
 * Deep Health Check for Load Balancers / Kubernetes.
 * Verifies connectivity to Database and Storage Provider (S3/Azure/Local Disk).
 */
router.get('/health', asyncHandler(async (req, res) => {
  const health = {
    status: 'ok',
    service: 'up',
    db: 'unknown',
    storage: 'unknown',
    storage_write: 'unknown',
    storage_provider: 'unknown',
    timestamp: new Date().toISOString()
  };

  let code = 200;
  const errors = [];

  // Check Database Connectivity
  const dbStartTime = Date.now();
  try {
    await db.raw('SELECT 1');
    health.db = 'connected';
    health.db_latency_ms = Date.now() - dbStartTime;
  } catch (err) {
    health.db = 'disconnected';
    health.db_error = err.message;
    health.status = 'error';
    code = 503;
    errors.push(`Database: ${err.message}`);
  }

  // Check Storage Connectivity & Permissions
  const storageStartTime = Date.now();
  try {
    const config = require('../config');
    health.storage_provider = config.storage.provider;

    const storageUp = await storageService.checkHealth();
    health.storage = storageUp ? 'connected' : 'disconnected';
    health.storage_latency_ms = Date.now() - storageStartTime;

    if (!storageUp) {
      health.status = 'error';
      health.storage_write = 'failed';
      code = 503;
      errors.push(`Storage (${health.storage_provider}): Health check failed`);
    } else {
      // checkHealth verifies write permissions for all providers
      health.storage_write = 'verified';
    }
  } catch (err) {
    health.storage = 'error';
    health.storage_error = err.message;
    health.storage_write = 'failed';
    health.status = 'error';
    code = 503;
    errors.push(`Storage: ${err.message}`);
  }

  // Add error summary if any failures occurred
  if (errors.length > 0) {
    health.errors = errors;
  }

  res.status(code).json(health);
}));

/**
 * Renders the Login Page.
 */
router.get('/login', authController.renderLogin);

/**
 * Processes user login.
 * Rate limited to prevent brute-force attacks.
 */
router.post('/login', loginLimiter, validate({ body: loginSchema }), authController.login);

/**
 * Destroys user session and redirects to login.
 */
router.post('/logout', authController.logout);

/**
 * Renders the Registration Page.
 */
router.get('/register', authController.renderRegister);

/**
 * Processes new user registration.
 * Accounts are 'pending' until approved by Admin.
 */
router.post('/register', loginLimiter, validate({ body: registerSchema }), authController.register);

/**
 * Renders the Forgot Password Page.
 */
router.get('/password/forgot', passwordResetController.renderForgotPassword);

/**
 * Handles forgot password form submission.
 * Generates and sends password reset token.
 * Rate limited to prevent abuse.
 */
router.post('/password/forgot', loginLimiter, passwordResetController.sendResetLink);

/**
 * Renders the Reset Password Page.
 * Requires valid token and email in query params.
 */
router.get('/password/reset', passwordResetController.renderResetPassword);

/**
 * Handles reset password form submission.
 * Validates token and updates user password.
 */
router.post('/password/reset', passwordResetController.resetPassword);

/**
 * Direct Download Handler.
 * Decrypts the token to validate ID and Expiry.
 * If valid, streams the file or redirects to Cloud URL.
 * Triggers 'Burn-on-Read' deletion if enabled.
 * Rate limited to prevent abuse and bandwidth exhaustion.
 */
router.get('/d/:token',
  downloadRateLimiter,
  validate({ params: tokenParamSchema }),
  publicController.processDownload
);

/**
 * Renders the Public Landing Page for a file.
 * Shows metadata (Name, Size, Expiry) if file exists.
 */
router.get('/download/:shortId',
  validate({ params: shortIdParamSchema }),
  publicController.renderLandingPage
);

/**
 * Verifies the password for a protected link.
 * If successful, sets a session flag to allow download.
 * Rate limited to 5 attempts per 15 minutes per link+IP to prevent brute force.
 */
router.post('/download/:shortId/verify',
  linkPasswordLimiter,
  validate({ params: shortIdParamSchema }),
  publicController.verifyLinkPassword
);

/**
 * Renders the file preview page.
 * Shows inline preview for supported file types (images, PDFs, text, videos, audio).
 */
router.get('/preview/:shortId',
  validate({ params: shortIdParamSchema }),
  previewController.renderPreviewPage
);

/**
 * Streams file content for inline preview.
 * Used by preview page to load file content with Content-Disposition: inline.
 */
router.get('/preview/:shortId/stream',
  validate({ params: shortIdParamSchema }),
  previewController.streamPreview
);

module.exports = router;
