/**
 * Query Result Caching Utility.
 *
 * In-memory cache for database query results to reduce database load.
 */

const logger = require('./logger');
const crypto = require('crypto');

/**
 * Cache configuration
 */
const config = {
  maxSize: 1000, // Maximum number of cache entries
  defaultTTL: 300000, // Default TTL: 5 minutes
  cleanupInterval: 60000, // Cleanup interval: 1 minute
  enabled: process.env.CACHE_ENABLED !== 'false'
};

/**
 * Cache storage
 * Structure: { key: { value, expiresAt, tags, size, accessCount, lastAccess } }
 */
const cache = new Map();

/**
 * Tag index for invalidation
 * Structure: { tag: Set<key> }
 */
const tagIndex = new Map();

/**
 * Cache statistics
 */
const stats = {
  hits: 0,
  misses: 0,
  sets: 0,
  evictions: 0,
  invalidations: 0
};

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
 * Gets a value from cache.
 */
function get(key) {
  if (!config.enabled) {
    return null;
  }

  const entry = cache.get(key);

  if (!entry) {
    stats.misses++;
    return null;
  }

  // Check expiration
  if (entry.expiresAt && Date.now() > entry.expiresAt) {
    // Expired - remove and return null
    cache.delete(key);
    stats.misses++;
    return null;
  }

  // Update access statistics
  entry.accessCount++;
  entry.lastAccess = Date.now();

  stats.hits++;
  return entry.value;
}

/**
 * Sets a value in cache.
 */
function set(key, value, options = {}) {
  if (!config.enabled) {
    return;
  }

  const {
    ttl = config.defaultTTL,
    tags = []
  } = options;

  // Check cache size and evict if necessary
  if (cache.size >= config.maxSize) {
    evictLRU();
  }

  // Calculate entry size (approximate)
  const size = JSON.stringify(value).length;

  // Create cache entry
  const entry = {
    value,
    expiresAt: ttl > 0 ? Date.now() + ttl : null,
    tags,
    size,
    accessCount: 0,
    lastAccess: Date.now(),
    createdAt: Date.now()
  };

  cache.set(key, entry);

  // Update tag index
  for (const tag of tags) {
    if (!tagIndex.has(tag)) {
      tagIndex.set(tag, new Set());
    }
    tagIndex.get(tag).add(key);
  }

  stats.sets++;
}

/**
 * Deletes a value from cache.
 */
function del(key) {
  const entry = cache.get(key);

  if (entry) {
    // Remove from tag index
    for (const tag of entry.tags) {
      const keys = tagIndex.get(tag);
      if (keys) {
        keys.delete(key);
        if (keys.size === 0) {
          tagIndex.delete(tag);
        }
      }
    }

    cache.delete(key);
  }
}

/**
 * Invalidates cache entries by tag.
 */
function invalidateByTag(tag) {
  if (!config.enabled) {
    return;
  }

  const keys = tagIndex.get(tag);

  if (keys) {
    let count = 0;
    for (const key of keys) {
      cache.delete(key);
      count++;
    }

    tagIndex.delete(tag);
    stats.invalidations += count;

    logger.info({
      tag,
      count
    }, `🗑️  [CACHE] Invalidated ${count} entries by tag: ${tag}`);
  }
}

/**
 * Clears all cache entries.
 */
function clear() {
  cache.clear();
  tagIndex.clear();
  logger.info('🗑️  [CACHE] Cache cleared');
}

/**
 * Evicts least recently used entry.
 */
function evictLRU() {
  let oldestKey = null;
  let oldestAccess = Infinity;

  for (const [key, entry] of cache.entries()) {
    if (entry.lastAccess < oldestAccess) {
      oldestAccess = entry.lastAccess;
      oldestKey = key;
    }
  }

  if (oldestKey) {
    del(oldestKey);
    stats.evictions++;
  }
}

/**
 * Cleanup expired entries.
 */
function cleanup() {
  const now = Date.now();
  let removed = 0;

  for (const [key, entry] of cache.entries()) {
    if (entry.expiresAt && now > entry.expiresAt) {
      del(key);
      removed++;
    }
  }

  if (removed > 0) {
    logger.info(`🧹 [CACHE] Cleaned up ${removed} expired entries`);
  }
}

/**
 * Gets cache statistics.
 */
function getStats() {
  const hitRate = stats.hits + stats.misses > 0
    ? (stats.hits / (stats.hits + stats.misses) * 100).toFixed(2)
    : 0;

  let totalSize = 0;
  for (const entry of cache.values()) {
    totalSize += entry.size;
  }

  return {
    size: cache.size,
    maxSize: config.maxSize,
    totalSizeBytes: totalSize,
    hits: stats.hits,
    misses: stats.misses,
    sets: stats.sets,
    evictions: stats.evictions,
    invalidations: stats.invalidations,
    hitRate: `${hitRate}%`,
    enabled: config.enabled
  };
}

/**
 * Wrapper function for caching query results.
 */
async function cacheQuery(namespace, params, queryFn, options = {}) {
  const key = generateKey(namespace, params);

  // Try to get from cache
  const cached = get(key);
  if (cached !== null) {
    return cached;
  }

  // Cache miss - execute query
  const result = await queryFn();

  // Store in cache
  set(key, result, options);

  return result;
}

/**
 * Start automatic cleanup interval.
 */
function startCleanup() {
  setInterval(cleanup, config.cleanupInterval);
  logger.info(`🚀 [CACHE] Cleanup scheduler started (interval: ${config.cleanupInterval}ms)`);
}

// Start cleanup on module load
if (config.enabled) {
  startCleanup();
}

module.exports = {
  get,
  set,
  del,
  invalidateByTag,
  clear,
  getStats,
  cacheQuery,
  generateKey
};
