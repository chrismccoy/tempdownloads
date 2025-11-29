/**
 * User Repository
 *
 * Manages all direct database interactions for the `users` table.
 *
 * - User Authentication lookups (by Username).
 * - User Management (Find All, Create, Update).
 * - Role and Status management.
 *
 * Extends BaseRepository for common CRUD operations.
 */

const BaseRepository = require('./BaseRepository');

class UserRepository extends BaseRepository {
  constructor(db) {
    super('users', db);
  }

  /**
   * Finds a single user by their unique username.
   * Used primarily during the Login process.
   */
  async findByUsername(username) {
    return this.findOneWhere({ username });
  }

  /**
   * Finds a single user by their unique email address.
   * Used for password reset and email-based lookups.
   */
  async findByEmail(email) {
    return this.findOneWhere({ email });
  }

  /**
   * Fetches all users in the system with specific columns.
   * Overrides base findAll to select specific columns.
   * Ordered by creation date (newest first).
   */
  async findAll() {
    return this.db(this.tableName)
      .select(
        'id',
        'username',
        'role',
        'status',
        'created_at',
        'last_login_at'
      )
      .orderBy('created_at', 'desc');
  }
}

module.exports = UserRepository;
