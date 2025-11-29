/**
 * Redis Cache Adapter.
 *
 * Distributed cache implementation using Redis for multi-server deployments.
 * Provides the same API as queryCache.js but with Redis backend.
 */

const Redis = require('ioredis');
const logger = require('./logger');
const crypto = require('crypto');

/**
 * Redis configuration
 */
const config = {
  enabled: process.env.REDIS_ENABLED === 'true',
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
  db: parseInt(process.env.REDIS_DB || '0', 10),
  keyPrefix: process.env.REDIS_KEY_PREFIX || 'tempdownloads:',
  defaultTTL: 300, // 5 minutes in seconds
  maxRetries: 3,
  retryDelay: 1000,
  enableOfflineQueue: false // Don't queue commands when disconnected
};

/**
 * Redis client instance
 */
let redisClient = null;

/**
 * Cache statistics
 */
const stats = {
  hits: 0,
  misses: 0,
  sets: 0,
  errors: 0,
  invalidations: 0
};

/**
 * Fallback to in-memory cache if Redis is unavailable
 */
let fallbackCache = null;

/**
 * Initializes Redis connection.
 */
function initializeRedis() {
  if (!config.enabled) {
    logger.info('Redis cache disabled, using in-memory cache');
    fallbackCache = require('./queryCache');
    return;
  }

  try {
    redisClient = new Redis({
      host: config.host,
      port: config.port,
      password: config.password,
      db: config.db,
      keyPrefix: config.keyPrefix,
      maxRetriesPerRequest: config.maxRetries,
      retryStrategy: (times) => {
        if (times > config.maxRetries) {
          logger.error('Redis connection failed after max retries, falling back to in-memory cache');
          useFallbackCache();
          return null; // Stop retrying
        }
        return Math.min(times * config.retryDelay, 3000);
      },
      enableOfflineQueue: config.enableOfflineQueue
    });

    redisClient.on('connect', () => {
      logger.info({
        host: config.host,
        port: config.port,
        db: config.db
      }, '🔗 [REDIS] Connected successfully');
    });

    redisClient.on('error', (err) => {
      stats.errors++;
      logger.error({ err }, '❌ [REDIS] Connection error');
    });

    redisClient.on('close', () => {
      logger.warn('🔌 [REDIS] Connection closed');
    });

    redisClient.on('reconnecting', () => {
      logger.info('🔄 [REDIS] Reconnecting...');
    });

  } catch (error) {
    logger.error({ err: error }, '❌ [REDIS] Initialization failed, using fallback cache');
    useFallbackCache();
  }
}

/**
 * Falls back to in-memory cache
 */
function useFallbackCache() {
  if (!fallbackCache) {
    fallbackCache = require('./queryCache');
    logger.warn('⚠️  [CACHE] Using in-memory fallback cache');
  }
}

/**
 * Generates a cache key from query parameters.
 */
function generateKey(namespace, params = {}) {
  const hash = crypto
    .createHash('sha256')
    .update(JSON.stringify(params))
    .digest('hex')
    .substring(0, 16);

  return `${namespace}:${hash}`;
}

/**
 * Gets a value from Redis cache.
 */
async function get(key) {
  // Use fallback if Redis not available
  if (fallbackCache) {
    return fallbackCache.get(key);
  }

  try {
    const data = await redisClient.get(key);

    if (!data) {
      stats.misses++;
      return null;
    }

    stats.hits++;
    return JSON.parse(data);

  } catch (error) {
    stats.errors++;
    logger.error({ err: error, key }, '❌ [REDIS] Get failed');

    // Fall back to in-memory cache
    useFallbackCache();
    return fallbackCache ? fallbackCache.get(key) : null;
  }
}

/**
 * Sets a value in Redis cache.
 */
async function set(key, value, options = {}) {
  const { ttl = config.defaultTTL, tags = [] } = options;

  // Use fallback if Redis not available
  if (fallbackCache) {
    return fallbackCache.set(key, value, { ttl: ttl * 1000, tags }); // Convert to ms
  }

  try {
    const serialized = JSON.stringify(value);

    // Set value with TTL
    if (ttl > 0) {
      await redisClient.setex(key, ttl, serialized);
    } else {
      await redisClient.set(key, serialized);
    }

    // Store tags for invalidation
    if (tags.length > 0) {
      const pipeline = redisClient.pipeline();
      for (const tag of tags) {
        pipeline.sadd(`tag:${tag}`, key);
        // Set expiration on tag set (1 hour longer than max TTL)
        pipeline.expire(`tag:${tag}`, ttl + 3600);
      }
      await pipeline.exec();
    }

    stats.sets++;

  } catch (error) {
    stats.errors++;
    logger.error({ err: error, key }, '❌ [REDIS] Set failed');

    // Fall back to in-memory cache
    useFallbackCache();
    if (fallbackCache) {
      fallbackCache.set(key, value, { ttl: ttl * 1000, tags });
    }
  }
}

/**
 * Deletes a value from Redis cache.
 */
async function del(key) {
  // Use fallback if Redis not available
  if (fallbackCache) {
    return fallbackCache.del(key);
  }

  try {
    await redisClient.del(key);
  } catch (error) {
    stats.errors++;
    logger.error({ err: error, key }, '❌ [REDIS] Delete failed');
  }
}

/**
 * Invalidates cache entries by tag.
 */
async function invalidateByTag(tag) {
  // Use fallback if Redis not available
  if (fallbackCache) {
    return fallbackCache.invalidateByTag(tag);
  }

  try {
    // Get all keys with this tag
    const keys = await redisClient.smembers(`tag:${tag}`);

    if (keys.length > 0) {
      // Delete all keys
      await redisClient.del(...keys);

      // Delete tag set
      await redisClient.del(`tag:${tag}`);

      stats.invalidations += keys.length;

      logger.info({
        tag,
        count: keys.length
      }, `🗑️  [REDIS] Invalidated ${keys.length} entries by tag: ${tag}`);
    }

  } catch (error) {
    stats.errors++;
    logger.error({ err: error, tag }, '❌ [REDIS] Invalidate by tag failed');
  }
}

/**
 * Clears all cache entries.
 */
async function clear() {
  // Use fallback if Redis not available
  if (fallbackCache) {
    return fallbackCache.clear();
  }

  try {
    // Only clear keys with our prefix
    const keys = await redisClient.keys('*');
    if (keys.length > 0) {
      await redisClient.del(...keys);
    }

    logger.info('🗑️  [REDIS] Cache cleared');

  } catch (error) {
    stats.errors++;
    logger.error({ err: error }, '❌ [REDIS] Clear failed');
  }
}

/**
 * Gets cache statistics.
 */
function getStats() {
  if (fallbackCache) {
    return fallbackCache.getStats();
  }

  return {
    ...stats,
    hitRate: stats.hits + stats.misses > 0
      ? (stats.hits / (stats.hits + stats.misses) * 100).toFixed(2) + '%'
      : '0%',
    backend: 'redis'
  };
}

/**
 * Closes Redis connection gracefully.
 */
async function disconnect() {
  if (redisClient) {
    await redisClient.quit();
    logger.info('👋 [REDIS] Disconnected');
  }
}

initializeRedis();

module.exports = {
  get,
  set,
  del,
  invalidateByTag,
  clear,
  generateKey,
  getStats,
  disconnect
};
