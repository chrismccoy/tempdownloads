/**
 * Storage Service Module.
 *
 * Provides an abstraction layer for file storage operations.
 */

const config = require('../config');
const LocalStorageStrategy = require('./storage/LocalStorageStrategy');
const S3StorageStrategy = require('./storage/S3StorageStrategy');
const AzureStorageStrategy = require('./storage/AzureStorageStrategy');

// Strategy registry
const strategies = {
  local: LocalStorageStrategy,
  s3: S3StorageStrategy,
  azure: AzureStorageStrategy,
};

// Initialize provider based on config
const StrategyClass = strategies[config.storage.provider] || LocalStorageStrategy;
const provider = new StrategyClass();

module.exports = provider;
