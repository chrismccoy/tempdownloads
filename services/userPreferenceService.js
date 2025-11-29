/**
 * User Preference Service
 *
 * Manages user preferences with default values and validation.
 * Provides a clean API for getting and setting user preferences.
 */

const { v4: uuidv4 } = require('uuid');
const userPreferenceRepository = require('../repositories/userPreferenceRepository').instance;
const logger = require('../utils/logger');

// Default preference values
const PREFERENCE_DEFAULTS = {
  default_expiry_seconds: null, // null = permanent by default
  default_has_landing_page: true,
  items_per_page: 15,
  email_notifications: true,
  theme: 'light'
};

// Valid preference keys
const VALID_KEYS = Object.keys(PREFERENCE_DEFAULTS);

/**
 * Get all preferences for a user with defaults.
 */
async function getAllPreferences(userId) {
  const preferences = await userPreferenceRepository.findByUserId(userId);

  // Build preferences object with defaults
  const result = { ...PREFERENCE_DEFAULTS };

  // Override with user's saved preferences
  preferences.forEach(pref => {
    try {
      result[pref.preference_key] = JSON.parse(pref.preference_value);
    } catch (e) {
      // If JSON parse fails, use the raw string value
      result[pref.preference_key] = pref.preference_value;
    }
  });

  return result;
}

/**
 * Get a specific preference value for a user.
 */
async function getPreference(userId, key) {
  if (!VALID_KEYS.includes(key)) {
    throw new Error(`Invalid preference key: ${key}`);
  }

  const pref = await userPreferenceRepository.findByUserAndKey(userId, key);

  if (!pref) {
    return PREFERENCE_DEFAULTS[key];
  }

  try {
    return JSON.parse(pref.preference_value);
  } catch (e) {
    return pref.preference_value;
  }
}

/**
 * Set a preference value for a user.
 */
async function setPreference(userId, key, value) {
  if (!VALID_KEYS.includes(key)) {
    throw new Error(`Invalid preference key: ${key}`);
  }

  // Validate value based on key
  const validatedValue = validatePreferenceValue(key, value);

  await userPreferenceRepository.upsert({
    id: uuidv4(),
    user_id: userId,
    preference_key: key,
    preference_value: JSON.stringify(validatedValue)
  });

  logger.info({ userId, key, value: validatedValue }, 'User preference updated');
}

/**
 * Set multiple preferences at once.
 */
async function setMultiplePreferences(userId, preferences) {
  for (const [key, value] of Object.entries(preferences)) {
    if (VALID_KEYS.includes(key)) {
      await setPreference(userId, key, value);
    }
  }
}

/**
 * Reset a preference to its default value.
 */
async function resetPreference(userId, key) {
  if (!VALID_KEYS.includes(key)) {
    throw new Error(`Invalid preference key: ${key}`);
  }

  await userPreferenceRepository.delete(userId, key);
  logger.info({ userId, key }, 'User preference reset to default');
}

/**
 * Reset all preferences to defaults.
 */
async function resetAllPreferences(userId) {
  await userPreferenceRepository.deleteAllForUser(userId);
  logger.info({ userId }, 'All user preferences reset to defaults');
}

/**
 * Validate and sanitize preference values.
 */
function validatePreferenceValue(key, value) {
  switch (key) {
    case 'default_expiry_seconds':
      if (value === null || value === '' || value === 'null') return null;
      const num = parseInt(value, 10);
      if (isNaN(num) || num < 0) throw new Error('Invalid expiry value');
      return num;

    case 'default_has_landing_page':
      return Boolean(value);

    case 'items_per_page':
      const items = parseInt(value, 10);
      if (isNaN(items) || items < 5 || items > 100) {
        throw new Error('Items per page must be between 5 and 100');
      }
      return items;

    case 'email_notifications':
      return Boolean(value);

    case 'theme':
      if (!['light', 'dark'].includes(value)) {
        throw new Error('Theme must be "light" or "dark"');
      }
      return value;

    default:
      return value;
  }
}

/**
 * Get default preferences object.
 */
function getDefaults() {
  return { ...PREFERENCE_DEFAULTS };
}

module.exports = {
  getAllPreferences,
  getPreference,
  setPreference,
  setMultiplePreferences,
  resetPreference,
  resetAllPreferences,
  getDefaults,
  VALID_KEYS
};
