/**
 * Creates all tables required for the TempDownloads application:
 * - users: User accounts with role-based access control
 * - links: Download links with security features and statistics
 * - audit_logs: Comprehensive audit trail
 * - failed_file_deletions: Retry mechanism for failed file deletions
 * - user_preferences: User-specific settings storage
 * - password_reset_tokens: Secure password reset tokens
 *
 * Uses Knex schema building methods that are compatible across
 * SQLite, MySQL, and PostgreSQL.
 *
 * Key Features:
 * - UUIDs for Primary Keys
 * - BigIntegers for Timestamps (Epoch milliseconds)
 * - JSON columns for flexible metadata
 * - Comprehensive indexes for performance
 */

exports.up = async function (knex) {
  // Users
  await knex.schema.createTable('users', (table) => {
    table.uuid('id').primary();
    table.string('username').unique().notNullable();
    table.string('email', 255).nullable().unique();
    table.string('password_hash').notNullable();

    // Role-Based Access Control
    table.string('role').defaultTo('user'); // 'user' or 'admin'
    table.string('status').defaultTo('pending'); // 'pending', 'active', 'revoked'

    // Timestamps (epoch milliseconds)
    table.bigInteger('created_at').notNullable();
    table.bigInteger('last_login_at').nullable();

    // Indexes
    table.index('email', 'idx_users_email');
  });

  // Links
  await knex.schema.createTable('links', (table) => {
    table.uuid('id').primary();

    // Identity
    table.string('short_id').nullable().unique();
    table.string('filename').notNullable();
    table.string('original_name').notNullable();

    // Ownership (Cascade Delete)
    table
      .uuid('created_by')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');

    // Lifecycle
    table.bigInteger('expires_at').nullable();
    table.bigInteger('created_at').notNullable();
    table.bigInteger('deleted_at').nullable(); // Soft delete

    // Settings
    table.boolean('has_landing_page').defaultTo(false);

    // Security Features
    table.string('password_hash').nullable();
    table.string('file_checksum').nullable();
    table.boolean('burn_after_read').defaultTo(false);
    table.boolean('is_encrypted').defaultTo(false);

    // Stats
    table.integer('visit_count').defaultTo(0);
    table.integer('download_count').defaultTo(0);

    // Performance Indexes
    table.index('deleted_at');
    table.index('created_by');
    table.index('short_id', 'idx_links_short_id');
    table.index('expires_at', 'idx_links_expires_at');
    table.index(['deleted_at', 'expires_at'], 'idx_garbage_collection');
    table.index(
      ['created_by', 'deleted_at', 'created_at'],
      'idx_user_active_links'
    );
    table.index(['created_by', 'deleted_at', 'expires_at'], 'idx_user_trash');
  });

  // Audit Logs
  await knex.schema.createTable('audit_logs', (table) => {
    table.uuid('id').primary();

    table
      .uuid('user_id')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');

    // Event Data
    table.string('action').notNullable();
    table.string('entity_type').nullable();
    table.string('entity_id').nullable();

    // Metadata (JSON for MySQL/PostgreSQL, TEXT for SQLite)
    table.json('details').nullable();
    table.string('ip_address').nullable();
    table.string('correlation_id', 36).nullable();

    // Timestamp
    table.bigInteger('created_at').notNullable();

    // Performance Indexes
    table.index('created_at');
    table.index('user_id');
    table.index('action', 'idx_audit_logs_action');
    table.index('correlation_id', 'idx_audit_logs_correlation');
    table.index(['user_id', 'created_at'], 'idx_audit_logs_user_time');
    table.index(['user_id', 'created_at'], 'idx_user_audit_timeline');
  });

  // Failed File Deletions
  await knex.schema.createTable('failed_file_deletions', (table) => {
    table.uuid('id').primary();
    table.string('storage_key').notNullable();
    table.uuid('link_id').nullable();
    table.string('provider').defaultTo('local'); // local, s3, azure
    table.text('error_message').nullable();
    table.integer('retry_count').defaultTo(0);
    table.bigInteger('created_at').notNullable();
    table.bigInteger('last_retry_at').nullable();

    // Indexes for cleanup job
    table.index('created_at', 'idx_failed_deletions_created');
    table.index(['retry_count', 'created_at'], 'idx_failed_deletions_retry');
  });

  // User Preferences
  await knex.schema.createTable('user_preferences', (table) => {
    table.uuid('id').primary();

    // Foreign Key to users table
    table
      .uuid('user_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');

    // Preference identifier (e.g., 'default_expiry_seconds', 'items_per_page')
    table.string('preference_key', 100).notNullable();

    // Preference value stored as JSON for flexibility
    table.text('preference_value').nullable();

    // Timestamps
    table.bigInteger('created_at').notNullable();
    table.bigInteger('updated_at').notNullable();

    // Indexes
    table.index('user_id', 'idx_user_preferences_user');
    table.unique(['user_id', 'preference_key'], 'uk_user_pref_key');
  });

  // Password Reset Tokens
  await knex.schema.createTable('password_reset_tokens', (table) => {
    // Primary Key: email address
    // This ensures only one active reset token per email at a time
    // New reset requests automatically invalidate old tokens
    table.string('email', 255).primary();

    // Hashed Token (SHA-256 hash of the actual token sent to user)
    // Never store the plaintext token - only the hash
    table.string('token', 64).notNullable();

    // Timestamp (epoch milliseconds)
    // Used to calculate token expiry (tokens valid for 1 hour)
    table.bigInteger('created_at').notNullable();

    // Index for cleanup job
    // Allows efficient deletion of expired tokens
    table.index('created_at', 'idx_password_reset_created_at');
  });

  console.log('✅ Database schema created successfully');
};

/**
 * Undo Migration
 *
 * Drops tables in specific order to avoid Foreign Key errors.
 */
exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('password_reset_tokens');
  await knex.schema.dropTableIfExists('user_preferences');
  await knex.schema.dropTableIfExists('failed_file_deletions');
  await knex.schema.dropTableIfExists('audit_logs');
  await knex.schema.dropTableIfExists('links');
  await knex.schema.dropTableIfExists('users');

  console.log('✅ Database schema dropped successfully');
};
