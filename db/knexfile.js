/**
 * Knex.js Configuration File.
 *
 * Supports multi-driver setup (SQLite, MySQL, PostgreSQL).
 */

const path = require('path');
const fs = require('fs');
const config = require('../config');

// If using SQLite, ensure the 'data' folder exists to prevent startup crashes.
if (config.database.client === 'better-sqlite3') {
  const dataDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
    console.log(`✅ Data directory created: ${dataDir}`);
  }
}

if (config.database.client === 'pg') {
  const types = require('pg').types;
  types.setTypeParser(20, (val) => parseInt(val, 10));
}

/**
 * Base Configuration Shared Across Environments.
 */
const baseConfig = {
  client: config.database.client,
  connection: config.database.connection,
  useNullAsDefault: true, // Required for SQLite
  migrations: {
    directory: path.join(__dirname, 'migrations'),
  },
};

/**
 * Driver-Specific Overrides.
 * Defines pool settings optimized for each driver.
 */
const configs = {
  'better-sqlite3': {
    ...baseConfig,
  },

  // MySQL: Standard pooling
  'mysql2': {
    ...baseConfig,
    pool: { min: 2, max: 10 }
  },

  // PostgreSQL: Standard pooling
  'pg': {
    ...baseConfig,
    pool: { min: 2, max: 10 }
  }
};

module.exports = {
  development: configs[config.database.client],
  production: configs[config.database.client],
};
