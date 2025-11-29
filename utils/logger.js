/**
 * Hybrid Logger Module.
 */

const pino = require('pino');
const path = require('path');
const fs = require('fs');
const config = require('../config');

const logDir = path.join(__dirname, '..', 'logs');

// Ensure log directory exists if file logging is enabled
if (config.logging.file && !fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

// Configure Pino File Transport
const fileTransport = config.logging.file
  ? pino.transport({
      target: 'pino/file',
      options: {
        destination: path.join(logDir, 'app.log'),
        mkdir: true,
      },
    })
  : undefined;

// Create structured file logger instance
const fileLogger = pino(
  {
    level: 'info',
    // Redact sensitive keys automatically
    redact: ['req.headers.authorization', 'req.body.password', 'req.session'],
  },
  fileTransport
);

// Emoji Formatters for Console
const formatters = {
  CREATE: (d) => `\n✨ [ACTION] Link Created:\n  🆔 ID: ${d.id}\n  📁 File: ${d.file}\n  ⏰ Expiry: ${d.expiry}\n  🌐 Landing Page: ${d.landingPage}`,

  UPDATE: (d) => {
    let out = `\n🔄 [ACTION] Link Updated:\n  🆔 ID: ${d.id}`;
    if (d.newFile && d.newFile !== 'No') {
      out += `\n  🆕 New File: ${d.newFile}\n  🗑️ Replaced: ${d.originalFile}`;
    }
    out += `\n  ⏰ Expiry: ${d.newExpiry}`;
    return out;
  },

  DELETE: (d) => `\n🗑️  [ACTION] Link Deleted:\n  🆔 ID: ${d.id}\n  📁 File: ${d.file}`,

  VISIT: (d) => `\n📄 [VISIT] Page Accessed:\n  🔗 ID: ${d.entityId}\n  🕵️ User Agent: ${d.userAgent || 'Unknown'}`,

  DOWNLOAD: (d) => `\n💾 [DOWNLOAD] Direct Download:\n  📁 File: ${d.file}`
};

const consoleLogger = {
  info: (obj, msg) => {
    if (!config.logging.console) return;

    // Handle simple string logs
    if (typeof obj === 'string') {
      console.log(`\nℹ️  [INFO] ${msg || obj}`);
      return;
    }

    // Handle Auth logs
    if (obj.username) {
      const emoji = msg.includes('logged out') ? '🚪' : '🔑';
      console.log(`\n${emoji} [AUTH] ${msg}`);
      return;
    }

    // Handle Action logs via formatters
    if (obj.action && formatters[obj.action]) {
      console.log(formatters[obj.action](obj.details));
      return;
    }

    // Default fallback
    console.log(`\nℹ️  [INFO] ${msg || ''}`, obj);
  },

  warn: (obj, msg) => {
    if (!config.logging.console) return;
    if (msg === 'Failed login attempt') {
      console.log(`\n❗ [AUTH] Failed login attempt.`);
    } else {
      console.warn(`\n⚠️  [WARN] ${msg}`, obj);
    }
  },

  error: (obj, msg) => {
    if (!config.logging.console) return;
    const errObj = obj.err || obj;
    console.error(`\n❌ [ERROR] ${msg}`, errObj.message || errObj);
  }
};

/**
 * The Public Logger Interface.
 * Proxies calls to both Console (if enabled) and File (if enabled).
 */
const logger = {
  info: (obj, msg) => {
    if (config.logging.file) fileLogger.info(obj, msg);
    consoleLogger.info(obj, msg);
  },
  warn: (obj, msg) => {
    if (config.logging.file) fileLogger.warn(obj, msg);
    consoleLogger.warn(obj, msg);
  },
  error: (obj, msg) => {
    if (config.logging.file) fileLogger.error(obj, msg);
    consoleLogger.error(obj, msg);
  },
  debug: (obj, msg) => {
    // Debug logs only go to file logger in development (not to console for cleaner output)
    if (config.logging.file) fileLogger.debug(obj, msg);
  },

  /**
   * Creates a child logger with automatic context injection.
   * Useful for automatically adding correlation IDs to all logs.
   */
  child: (bindings = {}) => {
    return {
      info: (obj, msg) => {
        const merged = typeof obj === 'string' ? bindings : { ...bindings, ...obj };
        logger.info(merged, msg || obj);
      },
      warn: (obj, msg) => {
        const merged = typeof obj === 'string' ? bindings : { ...bindings, ...obj };
        logger.warn(merged, msg || obj);
      },
      error: (obj, msg) => {
        const merged = typeof obj === 'string' ? bindings : { ...bindings, ...obj };
        logger.error(merged, msg || obj);
      },
      debug: (obj, msg) => {
        const merged = typeof obj === 'string' ? bindings : { ...bindings, ...obj };
        logger.debug(merged, msg || obj);
      },
      child: (childBindings) => {
        // Support nested child loggers
        return logger.child({ ...bindings, ...childBindings });
      }
    };
  }
};

module.exports = logger;
