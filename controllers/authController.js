/**
 * Authentication Controller.
 */

const asyncHandler = require('express-async-handler');
const container = require('../container');
const logger = require('../utils/logger');
const { COOKIES } = require('../constants');

/**
 * Renders the Login Page.
 */
const renderLogin = (req, res) => {
  res.render('public/login', {
    error: req.query.error || null,
    success: req.query.success || null
  });
};

/**
 * Renders the Registration Page.
 */
const renderRegister = (req, res) => {
  res.render('public/register', { error: null, success: null });
};

/**
 * Handles Login POST Request.
 *
 * Validates credentials, establishes a session, and redirects to the dashboard.
 */
const login = asyncHandler(async (req, res) => {
  const { username, password } = req.body;
  const authService = container.resolve('authService');
  const auditService = container.resolve('auditService');

  try {
    // Verify credentials via Service
    const user = await authService.login(username, password);

    // Establish Session State
    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.role = user.role;
    req.session.isAdmin = (user.role === 'admin');

    logger.info({ username, reqId: req.correlationId }, 'User logged in successfully');

    // Audit log successful authentication
    try {
      await auditService.log({
        action: 'LOGIN_SUCCESS',
        userId: user.id,
        entityType: 'user',
        entityId: user.id,
        correlationId: req.correlationId,
        metadata: {
          username: user.username,
          role: user.role,
          ip: req.ip,
          userAgent: req.get('user-agent')
        }
      });
    } catch (auditError) {
      // Don't fail the request if audit logging fails
      logger.error({ err: auditError, reqId: req.correlationId }, 'Failed to log successful authentication to audit');
    }

    res.redirect('/admin');

  } catch (error) {
    logger.warn({ reqId: req.correlationId, err: error.message }, 'Failed login attempt');

    // Audit log failed authentication attempt
    try {
      await auditService.log({
        action: 'LOGIN_FAILED',
        userId: null, // No user ID for failed logins
        entityType: 'user',
        entityId: null,
        correlationId: req.correlationId,
        metadata: {
          username: username,
          ip: req.ip,
          userAgent: req.get('user-agent'),
          error: error.message
        }
      });
    } catch (auditError) {
      // Don't fail the request if audit logging fails
      logger.error({ err: auditError, reqId: req.correlationId }, 'Failed to log authentication failure to audit');
    }

    res.status(401).render('public/login', { error: error.message });
  }
});

/**
 * Handles Registration POST Request.
 *
 * Creates a new 'pending' user account. Does not log them in immediately.
 * Collects email address for password reset functionality.
 */
const register = asyncHandler(async (req, res) => {
  const { username, email, password, passwordConfirm } = req.body;
  const authService = container.resolve('authService');

  try {
    await authService.register(username, email, password, passwordConfirm);

    logger.info({
      reqId: req.correlationId,
      action: 'USER_REGISTER',
      details: { username, email }
    }, 'User registered (pending approval)');

    // Show success message on the same page
    res.render('public/register', {
      error: null,
      success: 'Registration successful! Your account is pending admin approval. You can use your email for password reset.'
    });
  } catch (error) {
    logger.warn({
      reqId: req.correlationId,
      action: 'REGISTER_FAILED',
      details: { username, email, reason: error.message }
    }, 'Failed registration attempt');

    // Show validation error and preserve form values (except passwords)
    res.status(400).render('public/register', {
      error: error.message,
      success: null,
      oldValues: { username, email }
    });
  }
});

/**
 * Logs out the user.
 *
 * Destroys the server-side session and redirects to the login page.
 */
const logout = async (req, res) => {
  try {
    await new Promise((resolve, reject) => {
      req.session.destroy((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  } catch (err) {
    // Log error but continue with logout
    logger.error({
      reqId: req.correlationId,
      sessionId: req.sessionID,
      err
    }, 'Session destroy failed during logout');
  }

  // Clear session cookie regardless of destroy result
  res.clearCookie(COOKIES.SESSION_COOKIE_NAME);

  logger.info({
    reqId: req.correlationId,
    action: 'USER_LOGOUT',
    details: { username: req.session?.username || 'unknown' }
  }, 'User logged out');

  res.redirect('/login');
};

module.exports = { renderLogin, renderRegister, login, register, logout };
