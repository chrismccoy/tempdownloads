/**
 * Database Transaction Manager.
 */

const db = require('./database');
const logger = require('../utils/logger');

/**
 * Basic transaction wrapper (backward compatible).
 */
const executeTransaction = async (callback) => {
  return db.transaction(async (trx) => {
    return await callback(trx);
  });
};

/**
 * Enhanced transaction with automatic retry on deadlock.
 */
const executeTransactionWithRetry = async (callback, options = {}) => {
  const {
    maxRetries = 3,
    retryDelay = 100,
    correlationId = null,
    operation = 'TRANSACTION'
  } = options;

  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const startTime = Date.now();

    try {
      const result = await db.transaction(async (trx) => {
        return await callback(trx);
      });

      const duration = Date.now() - startTime;

      if (attempt > 1) {
        logger.info({
          reqId: correlationId,
          operation,
          attempt,
          duration
        }, 'Transaction succeeded after retry');
      } else if (duration > 1000) {
        // Log slow transactions
        logger.warn({
          reqId: correlationId,
          operation,
          duration
        }, 'Slow transaction detected');
      }

      return result;
    } catch (error) {
      lastError = error;
      const duration = Date.now() - startTime;

      // Check if error is retryable (deadlock, lock timeout, serialization failure)
      const isDeadlock = error.message?.includes('deadlock') ||
                        error.message?.includes('lock timeout') ||
                        error.code === 'SQLITE_BUSY' ||
                        error.code === '40P01' || // PostgreSQL deadlock
                        error.code === '40001';   // PostgreSQL serialization failure

      if (!isDeadlock || attempt === maxRetries) {
        // Non-retryable error or exhausted retries
        logger.error({
          reqId: correlationId,
          operation,
          attempt,
          duration,
          error: error.message,
          code: error.code,
          retryable: isDeadlock
        }, 'Transaction failed');
        throw error;
      }

      // Log retry attempt
      const backoffDelay = retryDelay * Math.pow(2, attempt - 1); // Exponential backoff
      logger.warn({
        reqId: correlationId,
        operation,
        attempt,
        nextRetryIn: backoffDelay,
        error: error.message
      }, 'Transaction deadlock detected, retrying');

      // Wait before retry with exponential backoff
      await new Promise(resolve => setTimeout(resolve, backoffDelay));
    }
  }

  throw lastError;
};

/**
 * Executes multiple operations within a single transaction.
 * Useful for complex multi-step operations that must be atomic.
 */
const executeAtomicOperations = async (operations, options = {}) => {
  const { correlationId = null, operation = 'ATOMIC_OPS' } = options;

  return executeTransactionWithRetry(async (trx) => {
    const results = [];

    for (let i = 0; i < operations.length; i++) {
      const result = await operations[i](trx);
      results.push(result);
    }

    return results;
  }, {
    ...options,
    operation: `${operation}[${operations.length} ops]`
  });
};

/**
 * Executes a transaction with automatic rollback on callback error.
 */
const executeTransactionWithContext = async (callback, context = {}) => {
  const { operation, correlationId, metadata = {} } = context;
  const startTime = Date.now();

  try {
    const result = await db.transaction(async (trx) => {
      return await callback(trx);
    });

    const duration = Date.now() - startTime;

    logger.debug({
      reqId: correlationId,
      operation,
      duration,
      ...metadata
    }, 'Transaction completed successfully');

    return result;
  } catch (error) {
    const duration = Date.now() - startTime;

    logger.error({
      reqId: correlationId,
      operation,
      duration,
      error: error.message,
      stack: error.stack,
      ...metadata
    }, 'Transaction failed with error');

    throw error;
  }
};

module.exports = {
  executeTransaction,
  executeTransactionWithRetry,
  executeAtomicOperations,
  executeTransactionWithContext
};
