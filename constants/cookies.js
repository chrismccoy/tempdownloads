/**
 * Cookie Name Constants.
 *
 * Centralized cookie names used across the application.
 */

/**
 * Session cookie name.
 * Used by express-session for storing session ID.
 */
const SESSION_COOKIE_NAME = 'connect.sid';

/**
 * Session ID name (internal session store key).
 * Used to obscure stack trace information.
 */
const SESSION_ID_NAME = 'sessionId';

/**
 * CSRF token cookie name.
 * Used for double-submit cookie CSRF protection.
 */
const CSRF_COOKIE_NAME = 'x-csrf-token';

module.exports = {
  SESSION_COOKIE_NAME,
  SESSION_ID_NAME,
  CSRF_COOKIE_NAME,
};
