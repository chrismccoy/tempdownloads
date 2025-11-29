/**
 * Database Init Module.
 */

const knex = require('knex');
const config = require('../config');
const knexConfig = require('./knexfile');

/**
 * Determine the current environment configuration.
 * Defaults to 'development' if config.env is not set.
 */
const environmentConfig = knexConfig[config.env];

/**
 * The initialized Knex database instance.
 */
const db = knex(environmentConfig);

module.exports = db;
