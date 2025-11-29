/**
 * Base Repository Class.
 *
 * All repository classes should extend this to inherit standard CRUD methods.
 */

const { v4: uuidv4 } = require('uuid');

class BaseRepository {
  constructor(tableName, db) {
    if (!tableName) {
      throw new Error('BaseRepository requires a table name');
    }
    this.tableName = tableName;
    this.db = db || require('../db/database');
  }

  /**
   * Finds a single record by ID.
   */
  async findById(id) {
    return this.db(this.tableName).where({ id }).first();
  }

  /**
   * Finds all records in the table.
   */
  async findAll(options = {}) {
    const {
      orderBy = 'created_at',
      direction = 'desc',
      limit = null,
      offset = null
    } = options;

    const query = this.db(this.tableName).orderBy(orderBy, direction);

    if (limit) query.limit(limit);
    if (offset) query.offset(offset);

    return query;
  }

  /**
   * Finds records matching a condition.
   */
  async findWhere(where) {
    return this.db(this.tableName).where(where);
  }

  /**
   * Finds a single record matching a condition.
   */
  async findOneWhere(where) {
    return this.db(this.tableName).where(where).first();
  }

  /**
   * Creates a new record.
   * Automatically generates UUID and timestamp if not provided.
   */
  async create(data) {
    const record = {
      id: data.id || uuidv4(),
      created_at: data.created_at || Date.now(),
      ...data
    };

    await this.db(this.tableName).insert(record);
    return record.id;
  }

  /**
   * Updates a record by ID.
   */
  async update(id, data, trx = null) {
    const query = (trx || this.db)(this.tableName).where({ id }).update(data);
    return query;
  }

  /**
   * Deletes a record by ID (hard delete).
   */
  async delete(id, trx = null) {
    const query = (trx || this.db)(this.tableName).where({ id }).delete();
    return query;
  }

  /**
   * Soft deletes a record by setting deleted_at timestamp.
   * Only works if the table has a deleted_at column.
   */
  async softDelete(id, trx = null) {
    return this.update(id, { deleted_at: Date.now() }, trx);
  }

  /**
   * Restores a soft-deleted record.
   */
  async restore(id, trx = null) {
    return this.update(id, { deleted_at: null }, trx);
  }

  /**
   * Counts the total number of records.
   */
  async count(where = {}) {
    const result = await this.db(this.tableName)
      .where(where)
      .count('id as count')
      .first();
    return parseInt(result.count) || 0;
  }

  /**
   * Checks if a record exists by ID.
   */
  async exists(id) {
    const count = await this.count({ id });
    return count > 0;
  }

  /**
   * Executes a raw query on this table.
   */
  async raw(callback) {
    return callback(this.db(this.tableName));
  }
}

module.exports = BaseRepository;
