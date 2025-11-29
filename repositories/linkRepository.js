/**
 * Link Repository Module.
 *
 * Manages all direct database interactions for the `links` table.
 */

class LinkRepository {
  constructor(db) {
    this.tableName = 'links';
    this.db = db || require('../db/database');
  }

  /**
   * Applies user scoping to a query.
   * If a userId is provided, it restricts the query to that user's records.
   */
  _applyScope(query, userId) {
    if (userId) {
      query.where('created_by', userId);
    }
    return query;
  }

  /**
   * Retrieves aggregate statistics for the dashboard.
   * Optimized to use SQL aggregation instead of fetching all rows.
   */
  async getStats(userId = null) {
    const query = this.db(this.tableName).whereNull('deleted_at');
    this._applyScope(query, userId);

    // Single query with all aggregations
    const stats = await query
      .select(
        this.db.raw('COUNT(*) as total'),
        this.db.raw('SUM(visit_count) as totalVisits'),
        this.db.raw('SUM(download_count) as totalDownloads'),
        this.db.raw('COUNT(CASE WHEN (expires_at IS NULL OR expires_at > ?) THEN 1 END) as activeLinks', [Date.now()]),
        this.db.raw('COUNT(CASE WHEN expires_at IS NOT NULL AND expires_at <= ? THEN 1 END) as expiredLinks', [Date.now()])
      )
      .first();

    return {
      counts: {
        totalVisits: parseInt(stats.totalVisits) || 0,
        totalDownloads: parseInt(stats.totalDownloads) || 0
      },
      totalLinks: { count: parseInt(stats.total) || 0 },
      activeLinks: parseInt(stats.activeLinks) || 0,
      expiredLinks: parseInt(stats.expiredLinks) || 0
    };
  }

  /**
   * Finds all active (non-deleted) links.
   * Ordered by creation date (newest first).
   */
  async findAll(userId = null, options = {}) {
    const {
      limit = 50,
      offset = 0,
      search = null,
      status = 'all',
      dateFrom = null,
      dateTo = null
    } = options;

    const query = this.db(this.tableName)
      .whereNull('deleted_at');

    // Apply search filter
    if (search && search.trim()) {
      const searchTerm = `%${search.trim()}%`;
      query.where(function() {
        this.where('original_name', 'like', searchTerm)
          .orWhere('short_id', 'like', searchTerm);
      });
    }

    // Apply status filter
    const now = Date.now();
    if (status === 'active') {
      query.where(function() {
        this.whereNull('expires_at')
          .orWhere('expires_at', '>', now);
      });
    } else if (status === 'expired') {
      query.whereNotNull('expires_at')
        .where('expires_at', '<=', now);
    }

    // Apply date range filter
    if (dateFrom) {
      query.where('created_at', '>=', dateFrom);
    }
    if (dateTo) {
      query.where('created_at', '<=', dateTo);
    }

    query.orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset);

    return this._applyScope(query, userId);
  }

  /**
   * Finds all Soft Deleted links (Trash).
   * Ordered by deletion date (newest deleted first).
   */
  async findSoftDeleted(userId = null, options = {}) {
    const { limit = 50, offset = 0, search = null } = options;

    const query = this.db(this.tableName)
      .whereNotNull('deleted_at');

    // Apply search filter
    if (search && search.trim()) {
      const searchTerm = `%${search.trim()}%`;
      query.where(function() {
        this.where('original_name', 'like', searchTerm)
          .orWhere('short_id', 'like', searchTerm);
      });
    }

    query.orderBy('deleted_at', 'desc')
      .limit(limit)
      .offset(offset);

    return this._applyScope(query, userId);
  }

  /**
   * Counts total active links (for pagination).
   */
  async countAll(userId = null, options = {}) {
    const {
      search = null,
      status = 'all',
      dateFrom = null,
      dateTo = null
    } = options;

    const query = this.db(this.tableName)
      .whereNull('deleted_at');

    // Apply search filter
    if (search && search.trim()) {
      const searchTerm = `%${search.trim()}%`;
      query.where(function() {
        this.where('original_name', 'like', searchTerm)
          .orWhere('short_id', 'like', searchTerm);
      });
    }

    // Apply status filter
    const now = Date.now();
    if (status === 'active') {
      query.where(function() {
        this.whereNull('expires_at')
          .orWhere('expires_at', '>', now);
      });
    } else if (status === 'expired') {
      query.whereNotNull('expires_at')
        .where('expires_at', '<=', now);
    }

    // Apply date range filter
    if (dateFrom) {
      query.where('created_at', '>=', dateFrom);
    }
    if (dateTo) {
      query.where('created_at', '<=', dateTo);
    }

    const result = await this._applyScope(query, userId).count('* as count').first();
    return parseInt(result.count, 10);
  }

  /**
   * Counts total soft-deleted links (for pagination).
   */
  async countSoftDeleted(userId = null, options = {}) {
    const { search = null } = options;

    const query = this.db(this.tableName)
      .whereNotNull('deleted_at');

    // Apply search filter
    if (search && search.trim()) {
      const searchTerm = `%${search.trim()}%`;
      query.where(function() {
        this.where('original_name', 'like', searchTerm)
          .orWhere('short_id', 'like', searchTerm);
      });
    }

    const result = await this._applyScope(query, userId).count('* as count').first();
    return parseInt(result.count, 10);
  }

  /**
   * Finds a single active link by its UUID.
   * Excludes soft-deleted items.
   */
  async findById(id, userId = null) {
    const query = this.db(this.tableName)
      .where({ id })
      .whereNull('deleted_at');

    return this._applyScope(query, userId).first();
  }

  /**
   * Finds a link by its UUID, including deleted ones.
   * Used for Restore and Hard Delete operations.
   */
  async findByIdIncludingDeleted(id, userId = null) {
    const query = this.db(this.tableName).where({ id });
    return this._applyScope(query, userId).first();
  }

  /**
   * Finds a link by its public short ID (e.g., 'a8f2...').
   * Ignores deleted links.
   */
  async findByShortId(shortId) {
    return this.db(this.tableName)
      .where({ short_id: shortId })
      .whereNull('deleted_at')
      .first();
  }

  /**
   * Finds links that are for Garbage Collection.
   *
   * Criteria:
   * 1. Hard Expired (expires_at < NOW)
   * 2. Soft Deleted past retention period (deleted_at < threshold)
   *
   * Optimized for large datasets with pagination support.
   */
  async findGarbage(retentionThreshold, options = {}) {
    const { limit = 1000, offset = 0 } = options;
    const now = Date.now();

    return this.db(this.tableName)
      .where(function() {
        // Check Expiration
        this.whereNotNull('expires_at').andWhere('expires_at', '<', now);
      })
      .orWhere(function() {
        // Check Retention Policy
        this.whereNotNull('deleted_at').andWhere('deleted_at', '<', retentionThreshold);
      })
      .orderBy('created_at', 'asc') // Process oldest first for fairness
      .limit(limit)
      .offset(offset);
  }

  /**
   * Counts total garbage items without fetching them.
   * Used for progress tracking in large dataset cleanups.
   */
  async countGarbage(retentionThreshold) {
    const now = Date.now();
    const result = await this.db(this.tableName)
      .where(function() {
        this.whereNotNull('expires_at').andWhere('expires_at', '<', now);
      })
      .orWhere(function() {
        this.whereNotNull('deleted_at').andWhere('deleted_at', '<', retentionThreshold);
      })
      .count('* as count')
      .first();

    return parseInt(result.count) || 0;
  }

  /**
   * Creates a new link record.
   */
  async create(data, trx = null) {
    const query = trx ? trx(this.tableName) : this.db(this.tableName);
    return query.insert(data);
  }

  /**
   * Updates an existing link record.
   */
  async update(id, data, trx = null) {
    const query = trx ? trx(this.tableName) : this.db(this.tableName);
    return query.where({ id }).update(data);
  }

  /**
   * Soft Deletes a link record.
   * Sets `deleted_at` to current timestamp.
   */
  async delete(id, trx = null) {
    const query = trx ? trx(this.tableName) : this.db(this.tableName);
    return query.where({ id }).update({ deleted_at: Date.now() });
  }

  /**
   * Restores a Soft Deleted link.
   * Resets `deleted_at` to NULL.
   */
  async restore(id, trx = null) {
    const query = trx ? trx(this.tableName) : this.db(this.tableName);
    return query.where({ id }).update({ deleted_at: null });
  }

  /**
   * Permanently removes a record from the database.
   */
  async hardDelete(id, trx = null) {
    const query = trx ? trx(this.tableName) : this.db(this.tableName);
    return query.where({ id }).del();
  }

  /**
   * Atomically increments a counter field.
   * Used for tracking Visits and Downloads.
   */
  async incrementCounter(id, field, trx = null) {
    const query = trx ? trx(this.tableName) : this.db(this.tableName);
    return query.where({ id }).increment(field, 1);
  }
}

module.exports = LinkRepository;
module.exports.instance = new LinkRepository();
