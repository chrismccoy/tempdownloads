/**
 * Temp Downloads Application
 */

const express = require('express');
const path = require('path');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const helmet = require('helmet');
const cookieParser = require('cookie-parser');

// Application Modules
const config = require('./config');
const logger = require('./utils/logger');
const db = require('./db/database');
const { TIMEOUTS, LIMITS, COOKIES, HEADERS } = require('./constants');

// Middleware
const {
  notFoundHandler,
  globalErrorHandler
} = require('./middleware/errorHandler');

const {
  limiter,
  doubleCsrfProtection,
  generateToken
} = require('./middleware/security');

const correlationMiddleware = require('./middleware/correlation');
const httpsRedirect = require('./middleware/httpsRedirect');
const inputSanitization = require('./middleware/inputSanitization');
const { requestDeduplication } = require('./middleware/requestDeduplication');
const { requestTimeout } = require('./middleware/requestTimeout');
const { initScheduler } = require('./jobs/scheduler');
const container = require('./container');
const { encryptedSessionSerializer } = require('./middleware/sessionEncryption');

// Routes & Controllers
const adminRoutes = require('./routes/admin');
const publicRoutes = require('./routes/public');
const publicController = require('./controllers/publicController');

const app = express();

/**
 * TRUST PROXY
 * Configures Express to trust the `X-Forwarded-For` header.
 * Critical when running behind Nginx, Cloudflare, or Load Balancers
 * to ensure Rate Limiting works on the actual Client IP, not the Proxy IP.
 */
app.set('trust proxy', config.trustProxy);

/**
 * Attaches a unique UUID (`x-correlation-id`) to every incoming request.
 */
app.use(correlationMiddleware);

/**
 * Request Timeout Protection.
 * Automatically terminates requests that exceed 30 seconds.
 */
app.use(requestTimeout({
  timeout: TIMEOUTS.REQUEST_TIMEOUT_MS,
  exclude: [
    '/admin/api/upload-local', // File uploads need more time
    '/api/csp-report' // Don't timeout CSP reports
  ]
}));

/**
 * HTTPS Enforcement (Production Only).
 * Redirects all HTTP requests to HTTPS with 301 permanent redirect.
 * Works correctly behind reverse proxies by checking X-Forwarded-Proto.
 */
app.use(httpsRedirect);

/**
 * Sets various HTTP headers to secure the app (HSTS, X-Frame-Options, etc.).
 * Configures a strict Content Security Policy (CSP) to prevent XSS.
 * HSTS header forces browsers to always use HTTPS for future requests.
 */
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      // Allow scripts from self and unpkg.com (for Alpine.js CDN)
      // Note: unsafe-inline is required for Alpine.js inline event handlers
      // Note: unsafe-eval is required for Alpine.js reactive expressions (x-data, x-show, etc.)
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://unpkg.com"],
      // Allow Alpine.js attributes (e.g., x-data, @click) to execute
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      // Allow connecting to configured Cloud Storage Providers
      connectSrc: ["'self'", "https://*.amazonaws.com", "https://*.r2.cloudflarestorage.com", "https://*.blob.core.windows.net"],
      imgSrc: ["'self'", "data:", "blob:"],
      // Automatically upgrade HTTP requests to HTTPS
      upgradeInsecureRequests: [],
      // Report violations to backend endpoint
      reportUri: '/api/csp-report',
    },
  },
  // HSTS Configuration - enforces HTTPS for 1 year
  hsts: {
    maxAge: TIMEOUTS.HSTS_MAX_AGE_SECONDS,
    includeSubDomains: true, // Apply to all subdomains
    preload: true // Allow inclusion in browser HSTS preload lists
  }
}));

app.use(express.static(path.join(__dirname, 'public')));

/**
 * Configured to handle standard form submissions and JSON payloads.
 */
app.use(express.json({ limit: LIMITS.REQUEST_BODY_SIZE_LIMIT, type: ['application/json', 'application/csp-report'] }));
app.use(express.urlencoded({ extended: true }));

/**
 * Input Sanitization.
 * Removes dangerous characters, HTML tags, and normalizes Unicode.
 */
app.use(inputSanitization());

/**
 * CSP Reporting
 */
app.post('/api/csp-report', publicController.handleCspReport);

// Parse Cookies (Required for Session)
app.use(cookieParser(config.security.sessionSecret));

/**
 * Session Management
 * Stores sessions in a local SQLite database file (`data/sessions.db`).
 * Session data is encrypted at rest using AES-256-GCM
 */
app.use(session({
  store: new SQLiteStore({
    db: 'sessions.db',
    dir: path.join(__dirname, 'data'),
    concurrentDB: true,
    table: 'sessions',
    cleanupInterval: TIMEOUTS.CLEANUP_INTERVAL_MS,
    // Use custom serializer for encryption
    serializer: encryptedSessionSerializer
  }),
  secret: config.security.sessionSecret,
  resave: false,
  saveUninitialized: false,
  name: COOKIES.SESSION_ID_NAME, // Hides stack trace names (e.g. connect.sid)
  cookie: {
    maxAge: TIMEOUTS.SESSION_MAX_AGE_MS,
    httpOnly: true, // Prevent XSS cookie theft
    // Force secure=false if not strictly production (fixes localhost login issues)
    secure: config.env === 'production',
    sameSite: 'lax'
  }
}));

/**
 * Global limiter to prevent abuse/spam across all routes.
 */
app.use(limiter);

/**
 * Validates Double-Submit Cookie for all state-changing methods (POST, PUT, DELETE).
 * Protects against Cross-Site Request Forgery.
 */
app.use(doubleCsrfProtection);

/**
 * Prevents duplicate processing of identical concurrent requests.
 * Useful for preventing double-submissions when users click buttons multiple times.
 */
app.use(requestDeduplication({
  windowMs: config.timeouts.dedupWindowMs // 5 second deduplication window
}));

/**
 * Injects variables into every EJS template automatically.
 */
app.use((req, res, next) => {
  const token = generateToken(req, res);
  res.locals.csrfToken = token;       // Available as <%= csrfToken %>
  res.locals.currentPath = req.path;  // For highlighting active nav links

  // Expose minimal User Context to views
  res.locals.user = req.session.userId ? {
    id: req.session.userId,
    username: req.session.username,
    role: req.session.role
  } : null;

  next();
});

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Favicon (204 No Content to prevent 404 logs)
app.get('/favicon.ico', (req, res) => res.status(204).end());

// Landing Page
app.get('/', (req, res) => res.render('public/landing'));

// Mount Route Modules
app.use('/admin', adminRoutes);
app.use('/', publicRoutes);

// 404 Handler
app.use(notFoundHandler);

// Global Error Handler
app.use(globalErrorHandler);

/**
 * Initialize Admin Account (if DB is empty).
 * Start Cron Jobs (Cleanup).
 * Log connection details.
 */
const server = app.listen(config.port, async () => {
  logger.info(`✅ Server started on port ${config.port}`);
  logger.info(`🛡️  Environment: ${config.env}`);
  logger.info(`💾 Storage: ${config.storage.provider}`);

  // Seed Default Admin if needed
  const authService = container.resolve('authService');
  await authService.ensureDefaultAdmin();

  // Initialize Background Jobs
  initScheduler();

  // Initialize Batch Job Handlers
  const batchService = require('./services/batchService');
  batchService.registerBatchHandlers();

  // Print Access URLs
  logger.info('------------------------------------------');
  logger.info(`🚀 Landing Page: ${config.appUrl}/`);
  logger.info(`🔐 Login:        ${config.appUrl}/login`);
  logger.info('------------------------------------------');
});

/**
 * Graceful Shutdown Handler.
 */
function gracefulShutdown(signal) {
  logger.info(`\n🛑 [SHUTDOWN] Received ${signal} - starting graceful shutdown...`);

  // Stop accepting new connections
  server.close(async (err) => {
    if (err) {
      logger.error({ err }, '❌ [SHUTDOWN] Error closing server');
      process.exit(1);
    }

    logger.info('✅ [SHUTDOWN] HTTP server closed - no longer accepting connections');

    try {
      // Close database connections
      logger.info('🔌 [SHUTDOWN] Closing database connections...');
      await db.destroy();
      logger.info('✅ [SHUTDOWN] Database connections closed');

      // Close storage connections (if applicable)
      // Storage services typically don't need explicit cleanup for S3/Azure clients
      logger.info('✅ [SHUTDOWN] Storage connections closed');

      logger.info('✅ [SHUTDOWN] Graceful shutdown complete');
      process.exit(0);
    } catch (error) {
      logger.error({ err: error }, '❌ [SHUTDOWN] Error during cleanup');
      process.exit(1);
    }
  });

  // Force shutdown after timeout if graceful shutdown takes too long
  const shutdownTimeout = setTimeout(() => {
    logger.error('❌ [SHUTDOWN] Forcing shutdown - graceful shutdown timeout exceeded');
    process.exit(1);
  }, TIMEOUTS.SHUTDOWN_TIMEOUT_MS);

  // Don't keep the process alive just for this timeout
  shutdownTimeout.unref();
}

// Register signal handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught errors to prevent crashes without logging
process.on('uncaughtException', (error) => {
  logger.error({ err: error }, '❌ [FATAL] Uncaught exception');
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error({ err: reason, promise }, '❌ [FATAL] Unhandled promise rejection');
  gracefulShutdown('unhandledRejection');
});
