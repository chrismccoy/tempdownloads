/**
 * Authentication & Authorization Middleware.
 *
 * Provides middleware functions to protect routes based on
 * the user's authentication status (Logged In) and their Role (Admin).
 */

/**
 * Checks if a user is authenticated.
 *
 * Verifies if a valid User ID exists in the session.
 * If valid, the request proceeds.
 * If invalid, the user is redirected to the login page.
 */
const isLoggedIn = (req, res, next) => {
  if (req.session && req.session.userId) {
    return next();
  }
  res.redirect('/login');
};

/**
 * Checks if the authenticated user has 'admin' privileges.
 *
 * Used to protect critical routes like User Management.
 * If the user is not an admin, it throws a 403 Forbidden error.
 */
const isSuperAdmin = (req, res, next) => {
  if (req.session && req.session.role === 'admin') {
    return next();
  }

  // Create a specific error object for the Global Error Handler
  const error = new Error('Access Denied: Admin privileges required.');
  error.statusCode = 403;

  next(error);
};

module.exports = { isLoggedIn, isSuperAdmin };
