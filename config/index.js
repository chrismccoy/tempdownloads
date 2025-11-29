/**
 * This module is responsible for loading, validating
 * the application's configuration settings.
 */

const { z } = require('zod');
const path = require('path');

// Load environment variables from .env file into process.env
const dotenvResult = require('dotenv').config({
  path: path.resolve(__dirname, '..', '.env')
});

/**
 * Helper function to coerce string values to booleans.
 * Accepts 'true' (string) or true (boolean).
 */
const toBool = (val) => val === 'true' || val === true;

/**
 * Zod Schema for Environment Variables.
 * Defines the shape, types, and validation rules for all config inputs.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  APP_URL: z.string().url({ message: "APP_URL must be a valid URL" }),
  TRUST_PROXY: z.string().default('loopback'),
  CORRELATION_HEADER: z.string().default('x-correlation-id'),

  // Selects the driver: 'sqlite' (default), 'mysql', or 'pg'
  DB_CLIENT: z.enum(['sqlite', 'mysql', 'pg']).default('sqlite'),

  // Connection Details (Required for MySQL/PostgreSQL)
  DB_HOST: z.string().optional(),
  DB_PORT: z.coerce.number().optional(),
  DB_USER: z.string().optional(),
  DB_PASSWORD: z.string().optional(),
  DB_NAME: z.string().optional(), // Specific Database Name
  DB_SSL_REJECT_UNAUTHORIZED: z.preprocess(toBool, z.boolean().default(true)), // Enforce SSL certificate validation

  // Seed Credentials
  ADMIN_INITIAL_USERNAME: z.string().default('admin'),
  ADMIN_INITIAL_PASSWORD: z.string().min(8, "Initial password must be strong"),

  // Security Secrets
  SESSION_SECRET: z.string().min(32, "Session secret must be at least 32 chars"),

  // Storage Configuration
  STORAGE_PROVIDER: z.enum(['local', 's3', 'azure']).default('local'),

  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_REGION: z.string().default('auto'),
  AWS_BUCKET_NAME: z.string().optional(),
  AWS_ENDPOINT: z.string().optional(),

  AZURE_STORAGE_CONNECTION_STRING: z.string().optional(),
  AZURE_CONTAINER_NAME: z.string().optional(),

  // Encryption Settings
  ENCRYPTION_KEYS: z.preprocess(
    (val) => val || process.env.ENCRYPTION_KEY,
    z.string().min(32)
  ).transform(val => val.split(',').map(k => k.trim())),

  ENCRYPTION_IV: z.string().length(16),

  // Redis Configuration
  REDIS_ENABLED: z.preprocess(toBool, z.boolean().default(false)),
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_DB: z.coerce.number().default(0),

  // Email Configuration
  EMAIL_PROVIDER: z.enum(['console', 'sendmail', 'smtp']).default('console'),
  EMAIL_FROM_ADDRESS: z.string().email().default('noreply@tempdownloads.com'),
  EMAIL_FROM_NAME: z.string().default('Temp Downloads'),

  // SMTP Configuration (only needed if EMAIL_PROVIDER=smtp)
  EMAIL_SMTP_HOST: z.string().optional(),
  EMAIL_SMTP_PORT: z.coerce.number().optional(),
  EMAIL_SMTP_USER: z.string().optional(),
  EMAIL_SMTP_PASSWORD: z.string().optional(),
  EMAIL_SMTP_SECURE: z.preprocess(toBool, z.boolean().default(false)), // true for 465, false for other ports

  // Operational Settings
  TRASH_RETENTION_DAYS: z.coerce.number().default(7),
  RATE_LIMIT_WINDOW_MINUTES: z.coerce.number().default(15),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(100),
  LOG_TO_CONSOLE: z.preprocess(toBool, z.boolean().default(true)),
  LOG_TO_FILE: z.preprocess(toBool, z.boolean().default(false)),
})
// Validation Refinement: Enforce Host/Auth fields if NOT using SQLite
.refine((data) => {
  if (data.DB_CLIENT !== 'sqlite') {
    return !!(data.DB_HOST && data.DB_USER && data.DB_PASSWORD && data.DB_NAME);
  }
  return true;
}, {
  message: "DB_HOST, DB_USER, DB_PASSWORD, and DB_NAME are required for MySQL/PostgreSQL",
  path: ["DB_HOST"], // Attach error to DB_HOST field
});

// Parse and Validate
const env = envSchema.parse(process.env);

/**
 * Client Map.
 * Translates our internal enum ('sqlite') to Knex driver names ('better-sqlite3').
 */
const clientMap = {
  sqlite: 'better-sqlite3',
  mysql: 'mysql2',
  pg: 'pg'
};

/**
 * The Main Configuration Object.
 */
const config = {
  env: env.NODE_ENV,
  port: env.PORT,
  appUrl: env.APP_URL,
  trustProxy: env.TRUST_PROXY,
  correlationHeader: env.CORRELATION_HEADER,

  // Database Configuration Block
  database: {
    client: clientMap[env.DB_CLIENT],
    // Dynamic Connection Object based on Driver
    connection: env.DB_CLIENT === 'sqlite'
      ? { filename: path.join(__dirname, '..', 'data', 'database.db') }
      : {
          host: env.DB_HOST,
          port: env.DB_PORT,
          user: env.DB_USER,
          password: env.DB_PASSWORD,
          database: env.DB_NAME,
          // Force SSL in Production for Cloud Databases
          ssl: env.NODE_ENV === 'production' ? { rejectUnauthorized: env.DB_SSL_REJECT_UNAUTHORIZED } : false
      }
  },

  seed: {
    username: env.ADMIN_INITIAL_USERNAME,
    password: env.ADMIN_INITIAL_PASSWORD
  },

  storage: {
    provider: env.STORAGE_PROVIDER,
    s3: {
      accessKeyId: env.AWS_ACCESS_KEY_ID,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
      region: env.AWS_REGION,
      bucket: env.AWS_BUCKET_NAME,
      endpoint: env.AWS_ENDPOINT,
    },
    azure: {
      connectionString: env.AZURE_STORAGE_CONNECTION_STRING,
      container: env.AZURE_CONTAINER_NAME,
    }
  },

  security: {
    sessionSecret: env.SESSION_SECRET,
    encryptionKeys: env.ENCRYPTION_KEYS,
    encryptionIv: env.ENCRYPTION_IV,
  },

  redis: {
    enabled: env.REDIS_ENABLED,
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD,
    db: env.REDIS_DB,
  },

  email: {
    provider: env.EMAIL_PROVIDER,
    from: {
      address: env.EMAIL_FROM_ADDRESS,
      name: env.EMAIL_FROM_NAME,
    },
    smtp: {
      host: env.EMAIL_SMTP_HOST,
      port: env.EMAIL_SMTP_PORT,
      secure: env.EMAIL_SMTP_SECURE,
      auth: {
        user: env.EMAIL_SMTP_USER,
        pass: env.EMAIL_SMTP_PASSWORD,
      }
    }
  },

  trashRetentionDays: env.TRASH_RETENTION_DAYS,

  rateLimiter: {
    windowMs: env.RATE_LIMIT_WINDOW_MINUTES * 60 * 1000,
    max: env.RATE_LIMIT_MAX_REQUESTS,
  },

  timeouts: {
    dedupWindowMs: 5000, // 5 seconds - request deduplication window
    requestTimeoutMs: 30000, // 30 seconds - HTTP request timeout
    shutdownTimeoutMs: 30000, // 30 seconds - graceful shutdown timeout
  },

  logging: {
    console: env.LOG_TO_CONSOLE,
    file: env.LOG_TO_FILE,
  },
};

module.exports = Object.freeze(config);
