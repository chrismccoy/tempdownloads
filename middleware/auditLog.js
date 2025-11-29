/**
 * Audit Logging Middleware.
 */

const container = require('../container');

/**
 * Extracts common audit fields from Express request object.
 */
function extractAuditContext(req) {
  return {
    userId: req.session?.userId || null,
    ip: req.ip,
    correlationId: req.correlationId
  };
}

/**
 * Helper function to log audit events from controllers.
 */
async function log(req, action, entityType, entityId, details = {}) {
  const context = extractAuditContext(req);
  const auditService = container.resolve('auditService');

  await auditService.log({
    action,
    userId: context.userId,
    entityType,
    entityId,
    details,
    ip: context.ip,
    correlationId: context.correlationId
  });
}

/**
 * Creates audit middleware that automatically logs after successful requests.
 */
function middleware(action, entityType, options = {}) {
  const { getEntityId = null, getDetails = null } = options;

  return async (req, res, next) => {
    // Store original json method
    const originalJson = res.json.bind(res);

    // Override json to intercept successful responses
    res.json = function(body) {
      // Only log on successful responses (2xx status codes)
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const context = extractAuditContext(req);

        // Extract entity ID if getter provided
        const entityId = getEntityId ? getEntityId(req, res, body) : null;

        // Extract details if getter provided
        const details = getDetails ? getDetails(req, res, body) : {};

        // Log audit event (fire-and-forget to not block response)
        const auditService = container.resolve('auditService');
        auditService.log({
          action,
          userId: context.userId,
          entityType,
          entityId,
          details,
          ip: context.ip,
          correlationId: context.correlationId
        }).catch(err => {
          // Log error but don't fail the request
          const logger = require('../utils/logger');
          logger.error({ err, reqId: req.correlationId }, 'Failed to write audit log');
        });
      }

      // Call original json method
      return originalJson(body);
    };

    next();
  };
}

/**
 * Audit logger for use in controllers after operation completes.
 * More flexible than middleware for complex scenarios.
 */
async function logAfter(req, action, entityType, entityId, details = {}) {
  return log(req, action, entityType, entityId, details);
}

module.exports = {
  log,
  logAfter,
  middleware,
  extractAuditContext
};
