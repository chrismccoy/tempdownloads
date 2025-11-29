/**
 * Admin Route Definitions.
 *
 * Contains all protected routes for the application dashboard.
 * Includes API endpoints for file operations, User Management,
 * Link Management, and View Rendering.
 */

const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');
const validate = require('../middleware/validate');
const { isLoggedIn, isSuperAdmin } = require('../middleware/auth');
const { idempotency } = require('../middleware/idempotency');
const { qrRateLimiter } = require('../middleware/security');
const fileValidation = require('../middleware/fileValidation');
const adminViewController = require('../controllers/adminViewController');
const adminApiController = require('../controllers/adminApiController');
const adminUserController = require('../controllers/adminUserController');
const userPreferenceController = require('../controllers/userPreferenceController');
const config = require('../config');
const container = require('../container');

const {
  linkBodySchema,
  idParamSchema,
  uploadIntentSchema,
  adminCreateUserSchema
} = require('../schemas/appSchemas');

/**
 * Apply Authentication Middleware to all routes in this router.
 * If valid session is not found, redirects to /login.
 */
router.use(isLoggedIn);

/**
 * Generates a signed Upload URL (S3/Azure) or a local upload token.
 * Used by the frontend to determine where to send the file binary.
 */
router.post(
  '/api/get-upload-intent',
  validate({ body: uploadIntentSchema }),
  fileValidation.validateFileMetadata,
  fileValidation.validateFileConsistency,
  adminApiController.getUploadIntent
);

/**
 * Handles streaming file uploads when Storage Provider is 'local'.
 * Pipes request stream through encryption/validation to disk.
 */
router.post(
  '/api/upload-local',
  (req, res, next) => {
     if(config.storage.provider !== 'local') return res.status(404).end();
     next();
  },
  idempotency,
  adminApiController.uploadLocal
);

/**
 * Generates a Data URL (base64) containing a QR code for a specific URL.
 * Rate limited to prevent DoS attacks (30 requests per 5 minutes per IP).
 */
router.get('/api/qr', qrRateLimiter, adminApiController.generateQr);

/**
 * Finalizes link creation. Saves metadata, expiration, and options to DB.
 */
router.post(
  '/links',
  validate({ body: linkBodySchema }),
  idempotency,
  adminApiController.createLink
);

/**
 * Updates an existing link. Can handle file replacement and password updates.
 */
router.post(
  '/links/edit/:id',
  validate({ params: idParamSchema }),
  validate({ body: linkBodySchema }),
  idempotency,
  adminApiController.updateLink
);

/**
 * Soft deletes a link (Moves to Trash).
 */
router.delete(
  '/links/:id',
  validate({ params: idParamSchema }),
  adminApiController.deleteLink
);

/**
 * Restores a link from the Trash.
 */
router.patch(
  '/links/:id/restore',
  validate({ params: idParamSchema }),
  adminApiController.restoreLink
);

/**
 * Permanently deletes a link and its associated file from storage.
 * Action is irreversible.
 */
router.delete(
  '/links/:id/force',
  validate({ params: idParamSchema }),
  idempotency,
  adminApiController.hardDeleteLink
);

/**
 * Batch soft delete links (move multiple to trash).
 */
router.post(
  '/links/batch/delete',
  adminApiController.batchDelete
);

/**
 * Batch restore links from trash.
 */
router.post(
  '/links/batch/restore',
  adminApiController.batchRestore
);

/**
 * Batch permanently delete links.
 */
router.post(
  '/links/batch/force-delete',
  adminApiController.batchForceDelete
);

/**
 * Renders the User Management dashboard.
 */
router.get('/users', isSuperAdmin, adminUserController.renderUserList);

/**
 * Renders the form to manually create a new user.
 */
router.get('/users/new', isSuperAdmin, adminUserController.renderNewUserForm);

/**
 * Processes the creation of a new user (Admin created).
 * Validates strong password requirements.
 */
router.post('/users', isSuperAdmin, validate({ body: adminCreateUserSchema }), adminUserController.createUser);

/**
 * Approves a pending user registration.
 */
router.patch('/users/:id/approve', isSuperAdmin, adminUserController.approveUser);

/**
 * Revokes access for a user (bans them).
 */
router.patch('/users/:id/revoke', isSuperAdmin, adminUserController.revokeUser);

/**
 * Promotes a standard user to Administrator.
 */
router.patch('/users/:id/promote', isSuperAdmin, adminUserController.promoteUser);

/**
 * Renders the main Admin Dashboard with statistics.
 */
router.get('/', adminViewController.renderDashboard);

/**
 * Renders the table list of active downloads.
 */
router.get('/links', adminViewController.renderListPage);

/**
 * Renders the 'Add New Download' form.
 */
router.get('/links/new', adminViewController.renderNewLinkForm);

/**
 * Renders the 'Edit Download' form.
 */
router.get(
  '/links/edit/:id',
  validate({ params: idParamSchema }),
  adminViewController.renderEditLinkForm
);

/**
 * Renders the Trash Can view (deleted items).
 */
router.get('/trash', adminViewController.renderTrashPage);

/**
 * Renders the System Audit Log table.
 */
router.get('/audit', isSuperAdmin, asyncHandler(async (req, res) => {
    // Simple inline controller for the audit view
    const auditService = container.resolve('auditService');
    const logs = await auditService.getRecentLogs(100);
    res.render('admin/audit', { title: 'Audit Log', logs });
}));

/**
 * Renders the user preferences page.
 */
router.get('/preferences', userPreferenceController.renderPreferencesPage);

/**
 * Updates user preferences.
 */
router.post('/preferences', userPreferenceController.updatePreferences);

/**
 * Resets all preferences to defaults.
 */
router.post('/preferences/reset', userPreferenceController.resetPreferences);

module.exports = router;
