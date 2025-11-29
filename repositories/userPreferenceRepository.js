/**
 * User Preference Repository
 *
 * Handles all database operations for user preferences.
 * Manages CRUD operations for user-specific settings.
 */

class UserPreferenceRepository {
  constructor(db) {
    this.tableName = 'user_preferences';
    this.db = db || require('../db/database');
  }

  /**
   * Find all preferences for a specific user.
   */
  async findByUserId(userId) {
    return this.db(this.tableName)
      .where({ user_id: userId })
      .select('*');
  }

  /**
   * Find a specific preference by user and key.
   */
  async findByUserAndKey(userId, key) {
    return this.db(this.tableName)
      .where({ user_id: userId, preference_key: key })
      .first();
  }

  /**
   * Create or update a preference.
   */
  async upsert(data, trx = null) {
    const query = trx ? trx(this.tableName) : this.db(this.tableName);

    // Check if preference exists
    const existing = await this.findByUserAndKey(data.user_id, data.preference_key);

    if (existing) {
      // Update existing preference
      return query
        .where({ user_id: data.user_id, preference_key: data.preference_key })
        .update({
          preference_value: data.preference_value,
          updated_at: Date.now()
        });
    } else {
      // Insert new preference
      return query.insert({
        ...data,
        created_at: Date.now(),
        updated_at: Date.now()
      });
    }
  }

  /**
   * Delete a specific preference.
   */
  async delete(userId, key, trx = null) {
    const query = trx ? trx(this.tableName) : this.db(this.tableName);
    return query
      .where({ user_id: userId, preference_key: key })
      .del();
  }

  /**
   * Delete all preferences for a user.
   */
  async deleteAllForUser(userId, trx = null) {
    const query = trx ? trx(this.tableName) : this.db(this.tableName);
    return query
      .where({ user_id: userId })
      .del();
  }
}

module.exports = UserPreferenceRepository;
module.exports.instance = new UserPreferenceRepository();
