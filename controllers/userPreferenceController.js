/**
 * User Preference Controller
 *
 * Handles user preference management endpoints.
 */

const asyncHandler = require('express-async-handler');
const userPreferenceService = require('../services/userPreferenceService');
const ApiResponse = require('../utils/apiResponse');
const logger = require('../utils/logger');

/**
 * Renders the user preferences page.
 */
const renderPreferencesPage = asyncHandler(async (req, res) => {
  const preferences = await userPreferenceService.getAllPreferences(req.session.userId);
  const defaults = userPreferenceService.getDefaults();

  res.render('admin/preferences', {
    title: 'My Preferences',
    preferences,
    defaults
  });
});

/**
 * Updates user preferences (API endpoint).
 */
const updatePreferences = asyncHandler(async (req, res) => {
  const {
    default_expiry_seconds,
    default_has_landing_page,
    items_per_page,
    email_notifications,
    theme
  } = req.body;

  try {
    // Build preferences object from form data
    const preferences = {
      default_expiry_seconds: default_expiry_seconds === '' ? null : default_expiry_seconds,
      default_has_landing_page: default_has_landing_page === 'on' || default_has_landing_page === true,
      items_per_page,
      email_notifications: email_notifications === 'on' || email_notifications === true,
      theme: theme || 'light'
    };

    await userPreferenceService.setMultiplePreferences(req.session.userId, preferences);

    logger.info({ userId: req.session.userId }, 'User preferences updated');

    ApiResponse.success(res, 'Preferences saved successfully', {
      redirectTo: '/admin/preferences'
    });
  } catch (error) {
    logger.error({ err: error, userId: req.session.userId }, 'Error updating preferences');
    ApiResponse.error(res, error.message, 400);
  }
});

/**
 * Resets all preferences to defaults.
 */
const resetPreferences = asyncHandler(async (req, res) => {
  await userPreferenceService.resetAllPreferences(req.session.userId);

  logger.info({ userId: req.session.userId }, 'User preferences reset');

  ApiResponse.success(res, 'Preferences reset to defaults', {
    redirectTo: '/admin/preferences'
  });
});

module.exports = {
  renderPreferencesPage,
  updatePreferences,
  resetPreferences
};
