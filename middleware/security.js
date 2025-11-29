/**
 * Security Middleware Module.
 */

const rateLimit = require('express-rate-limit');
const { doubleCsrf } = require('csrf-csrf');
const config = require('../config');
const { TIMEOUTS, LIMITS } = require('../constants');
const { AppError } = require('../utils/AppError');

/**
 * General Rate Limiter.
 * Applied globally to most routes to throttle excessive traffic.
 */
const limiter = rateLimit({
  windowMs: config.rateLimiter.windowMs, // Configurable window (e.g., 15 mins)
  max: config.rateLimiter.max,           // Configurable max requests (e.g., 100)
  standardHeaders: true,
  legacyHeaders: false,

  // Exempt authenticated users from strict rate limiting
  skip: (req) => (req.session && req.session.userId) ? true : false,

  // Custom error handler
  handler: (req, res, next) => next(new AppError('Too many requests. Please try again later.', 429))
});

/**
 * Strict Login Rate Limiter.
 * Applied specifically to Login/Register endpoints.
 */
const loginLimiter = rateLimit({
  windowMs: TIMEOUTS.RATE_LIMIT_WINDOW_MS,
  max: LIMITS.LOGIN_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next) => next(new AppError('Too many login attempts. Account locked temporarily.', 429))
});

/**
 * CSRF Protection Configuration (Double Submit Cookie Pattern).
 */
const {
  doubleCsrfProtection,
  generateToken
} = doubleCsrf({
  getSecret: () => config.security.sessionSecret,
  cookieName: 'x-csrf-token',
  cookieOptions: {
    httpOnly: true,
    sameSite: 'lax', // Balance between security and usability
    // Secure: true in Production (HTTPS), false in Dev (HTTP)
    secure: config.env === 'production',
    path: '/',
  },
  size: 64,
  ignoredMethods: ['GET', 'HEAD', 'OPTIONS'],
  getTokenFromRequest: (req) => req.headers['x-csrf-token'] || req.body._csrf
});

/**
 * QR Code Generation Rate Limiter.
 */
const qrRateLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 30, // 30 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next) => next(new AppError('Too many QR code requests. Please try again later.', 429))
});

module.exports = {
  limiter,
  loginLimiter,
  qrRateLimiter,
  doubleCsrfProtection,
  generateToken
};
