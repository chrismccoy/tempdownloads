/**
 * HTTP Header Constants.
 *
 * Centralized HTTP header names used across the application.
 */

/**
 * Correlation ID header name.
 * Used for request tracing and distributed logging.
 */
const CORRELATION_HEADER = 'x-correlation-id';

/**
 * Forwarded protocol header.
 * Used to detect HTTPS behind reverse proxies.
 */
const FORWARDED_PROTO_HEADER = 'x-forwarded-proto';

/**
 * Forwarded host header.
 * Used to get original host behind reverse proxies.
 */
const FORWARDED_HOST_HEADER = 'x-forwarded-host';

/**
 * Idempotency key header.
 * Used for idempotent request handling.
 */
const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';

module.exports = {
  CORRELATION_HEADER,
  FORWARDED_PROTO_HEADER,
  FORWARDED_HOST_HEADER,
  IDEMPOTENCY_KEY_HEADER,
};
