/**
 * Audit Logging Service.
 *
 * Responsible for recording and retrieving system audit logs.
 * Automatically sanitizes sensitive data before storage.
 */

const { v4: uuidv4 } = require('uuid');
const { sanitizeAuditDetails } = require('../utils/sanitizer');

class AuditService {
  /**
   * Creates AuditService with injected dependencies.
   */
  constructor(db, logger) {
    this.db = db || require('../db/database');
    this.logger = logger || require('../utils/logger');
  }

  /**
   * Records a new entry in the audit log.
   * Automatically sanitizes sensitive data from details before storage.
   */
  async log({ action, userId, entityType, entityId, details, ip, correlationId }) {
    try {
      // Sanitize details to remove sensitive information (passwords, tokens, etc.)
      const sanitizedDetails = details ? sanitizeAuditDetails(details) : null;

      const safeDetails = sanitizedDetails ? JSON.stringify(sanitizedDetails) : null;

      await this.db('audit_logs').insert({
        id: uuidv4(),
        user_id: userId || null,
        action,
        entity_type: entityType || null,
        entity_id: entityId || null,
        details: safeDetails,
        ip_address: ip || 'unknown',
        correlation_id: correlationId || null,
        created_at: Date.now()
      });
    } catch (error) {
      // Fail safe: Do not crash the main request if logging fails.
      this.logger.error({ err: error }, 'Failed to write audit log');
    }
  }

  /**
   * Retrieves a paginated list of recent audit logs.
   */
  async getRecentLogs(limit = 50, offset = 0) {
    const logs = await this.db('audit_logs')
      .leftJoin('users', 'audit_logs.user_id', 'users.id')
      .select(
        'audit_logs.*',
        'users.username as actor_name'
      )
      .orderBy('audit_logs.created_at', 'desc')
      .limit(limit)
      .offset(offset);

    return logs.map(log => {
      if (log.details) {
        if (typeof log.details === 'string') {
          try {
            log.details = JSON.parse(log.details);
          } catch(e) {
            // If parse fails, keep as string
          }
        }
      }
      return log;
    });
  }
}

module.exports = AuditService;
