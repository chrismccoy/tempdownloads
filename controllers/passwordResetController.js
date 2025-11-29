/**
 * Password Reset Controller
 *
 * Handles forgot password and reset password.
 */

const asyncHandler = require('express-async-handler');
const logger = require('../utils/logger');
const config = require('../config');

// Services will be injected via DI container
let passwordResetService;
let emailService;

/**
 * Initialize controller with dependencies.
 */
function init(passwordResetSvc, emailSvc) {
  passwordResetService = passwordResetSvc;
  emailService = emailSvc;
}

/**
 * Renders the Forgot Password Page.
 */
const renderForgotPassword = (req, res) => {
  res.render('public/forgot-password', {
    error: null,
    success: null,
    csrfToken: req.csrfToken()
  });
};

/**
 * Handles Forgot Password POST Request.
 *
 * Generates a password reset token and sends it via email (or logs it in development).
 */
const sendResetLink = asyncHandler(async (req, res) => {
  const { email } = req.body;

  try {
    const result = await passwordResetService.createToken(email);

    // Generate reset URL
    const resetUrl = `${req.protocol}://${req.get('host')}/password/reset?token=${result.token}&email=${encodeURIComponent(email)}`;

    // Send email via email service
    try {
      await emailService.sendPasswordResetEmail(email, resetUrl, result.token);

      logger.info({
        reqId: req.correlationId,
        email
      }, 'Password reset email sent');

      res.render('public/forgot-password', {
        error: null,
        success: 'If that email address is registered, password reset instructions have been sent.',
        csrfToken: req.csrfToken()
      });
    } catch (emailError) {
      // Email failed to send, but still show success for security
      logger.error({
        reqId: req.correlationId,
        email,
        err: emailError
      }, 'Failed to send password reset email');

      // In development, show debug info
      if (config.env === 'development') {
        res.render('public/forgot-password', {
          error: null,
          success: 'Email sending failed. Check logs for reset link.',
          debugToken: result.token,
          csrfToken: req.csrfToken()
        });
      } else {
        // In production, don't reveal the failure
        res.render('public/forgot-password', {
          error: null,
          success: 'If that email address is registered, password reset instructions have been sent.',
          csrfToken: req.csrfToken()
        });
      }
    }
  } catch (error) {
    // For security, don't reveal if email exists
    // Return success message anyway to prevent email enumeration
    logger.warn({
      reqId: req.correlationId,
      email,
      error: error.message
    }, 'Password reset attempt failed');

    res.render('public/forgot-password', {
      error: null,
      success: 'If that email address is registered, password reset instructions have been sent.',
      csrfToken: req.csrfToken()
    });
  }
});

/**
 * Renders the Reset Password Page.
 */
const renderResetPassword = asyncHandler(async (req, res) => {
  const { email, token } = req.query;

  if (!email || !token) {
    return res.redirect('/login?error=' + encodeURIComponent('Invalid reset link'));
  }

  res.render('public/reset-password', {
    email,
    token,
    error: null,
    csrfToken: req.csrfToken()
  });
});

/**
 * Handles Reset Password POST Request.
 *
 * Validates the token and updates the user's password.
 */
const resetPassword = asyncHandler(async (req, res) => {
  const { email, token, password, passwordConfirm } = req.body;

  try {
    await passwordResetService.resetPassword(email, token, password, passwordConfirm);

    logger.info({
      reqId: req.correlationId,
      email
    }, 'Password reset successful');

    // Redirect to login with success message
    res.redirect('/login?success=' + encodeURIComponent('Password reset successful! You can now login with your new password.'));
  } catch (error) {
    logger.warn({
      reqId: req.correlationId,
      email,
      error: error.message
    }, 'Password reset failed');

    res.status(400).render('public/reset-password', {
      email,
      token,
      error: error.message,
      csrfToken: req.csrfToken()
    });
  }
});

module.exports = {
  init,
  renderForgotPassword,
  sendResetLink,
  renderResetPassword,
  resetPassword
};
