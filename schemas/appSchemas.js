/**
 * Zod Schemas Validation Module.
 *
 * Defines the validation rules for all incoming API requests.
 */

const { z } = require('zod');
const { LIMITS } = require('../constants');

/**
 * Extracts the first value if the input is an array.
 */
const singleValue = (val) => (Array.isArray(val) ? val[0] : val);

/**
 * Coerces various input types into a Boolean.
 * Handles HTML checkbox values ('on'), string literals ('true'), and numbers ('1').
 */
const toBoolean = (val) => {
  const v = singleValue(val);
  return v === 'on' || v === 'true' || v === '1' || v === 1 || v === true;
};

/**
 * Parses expiry value into Unix timestamp.
 * Handles custom date picker, "never" for permanent links, and duration strings.
 */
function parseExpiryTimestamp(expiryStr, customExpiry) {
  // Custom Date Picker
  if (expiryStr === 'custom' && customExpiry) {
    const date = new Date(customExpiry);
    if (!isNaN(date.getTime())) {
      return date.getTime();
    }
    return undefined;
  }

  // Permanent Link
  if (expiryStr === 'never') {
    return null;
  }

  // Standard Duration (e.g., "3600" seconds)
  if (expiryStr && expiryStr !== '' && expiryStr !== 'custom') {
    const durationSeconds = parseInt(expiryStr, 10);
    if (!isNaN(durationSeconds)) {
      return Date.now() + durationSeconds * 1000;
    }
  }

  return undefined;
}

/**
 * Normalizes link creation/update data from form inputs to backend format.
 */
function normalizeLinkData(data) {
  const timestamp = parseExpiryTimestamp(data.expiry, data.custom_expiry);

  return {
    key: data.key,
    original_name: data.original_name,
    expiryTimestamp: timestamp,
    hasLandingPage: !!data.has_landing_page,
    password: data.password || undefined,
    burn_after_read: data.burn_after_read,
    checksum: data.checksum || null,
    is_encrypted: !!data.is_encrypted
  };
}

/**
 * Schema for User Login.
 * Login requires any non-empty password
 */
const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

/**
 * Strong password validation rules
 * Used for both user registration and admin-created users.
 *
 * Password Requirements:
 * - At least 8 characters long
 * - Contains at least one uppercase letter (A-Z)
 * - Contains at least one lowercase letter (a-z)
 * - Contains at least one number (0-9)
 * - Contains at least one special character (!@#$%^&*(),.?":{}|<>)
 */
const strongPasswordSchema = z.string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter")
  .regex(/[0-9]/, "Password must contain at least one number")
  .regex(/[!@#$%^&*(),.?":{}|<>\-_=+[\]\\\/`~;']/, "Password must contain at least one special character");

/**
 * Schema for User Registration.
 * Enforces strong password complexity requirements for new accounts.
 */
const registerSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters").max(50, "Username too long"),
  password: strongPasswordSchema,
});

/**
 * Schema for Admin User Creation.
 * Enforces same strong password requirements as registration.
 */
const adminCreateUserSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters").max(50, "Username too long"),
  password: strongPasswordSchema,
  isAdmin: z.preprocess(toBoolean, z.boolean().optional()),
});

/**
 * Maximum file size: imported from constants module.
 */
const MAX_FILE_SIZE = LIMITS.MAX_FILE_SIZE_BYTES;

/**
 * Schema for Upload Intent Requests.
 * Validates the file metadata before granting an upload token/URL.
 * Enforces file size limits at the schema level.
 */
const uploadIntentSchema = z.object({
  filename: z.string().min(1, "Filename is required"),
  mimetype: z.string().default('application/octet-stream'),
  filesize: z.number()
    .int("File size must be an integer")
    .positive("File size must be positive")
    .max(MAX_FILE_SIZE, `File size exceeds maximum limit of ${MAX_FILE_SIZE / 1024 / 1024}MB`)
    .optional()
}).refine(
  data => !data.filesize || data.filesize <= MAX_FILE_SIZE,
  {
    message: `File size must not exceed ${MAX_FILE_SIZE / 1024 / 1024}MB`,
    path: ['filesize']
  }
);

/**
 * Schema for Creating or Updating a Link.
 *
 * This complex schema handles:
 * 1. Optional metadata (key, original_name) for file updates.
 * 2. Expiry Logic (converting dropdown values "3600" into future timestamps).
 * 3. Feature Flags (Landing Page, Burn-on-Read, Encryption).
 */
const linkBodySchema = z
  .object({
    // File Metadata (Optional for Edit operations)
    key: z.string().optional(),
    original_name: z.string().optional(),

    // Expiry Configuration
    // Accepts string duration ("3600") or special keywords ("custom", "never")
    expiry: z.preprocess(singleValue, z.string().optional().nullable()),
    custom_expiry: z.preprocess(singleValue, z.string().optional().nullable()),

    // Feature Toggles
    has_landing_page: z.preprocess(toBoolean, z.boolean().optional()),
    burn_after_read: z.preprocess(toBoolean, z.boolean().optional()),

    // Security Settings
    // Password accepts empty string (to remove protection) or null
    password: z.string().optional().nullable().or(z.literal('')),

    // Internal Metadata passed from the frontend uploader component
    checksum: z.string().optional().nullable(),
    is_encrypted: z.boolean().optional().default(false),
  })
  .transform(normalizeLinkData);

/**
 * Schema for validating Route Parameters (UUIDs).
 * Ensures :id is always a valid UUIDv4 to prevent SQL injection via raw queries.
 */
const idParamSchema = z.object({
  id: z.string().uuid(),
});

/**
 * Schema for validating Download Tokens (Encrypted strings).
 * Tokens should be base64url encoded strings with minimum length.
 */
const tokenParamSchema = z.object({
  token: z.string()
    .min(16, "Invalid token format")
    .max(512, "Token too long")
    .regex(/^[A-Za-z0-9_:-]+$/, "Token must be alphanumeric with hyphens/underscores/colons"),
});

/**
 * Schema for validating Public Short IDs (Alphanumeric).
 * Short IDs are typically 8-12 character alphanumeric strings.
 */
const shortIdParamSchema = z.object({
  shortId: z.string()
    .min(6, "Short ID too short")
    .max(16, "Short ID too long")
    .regex(/^[a-f0-9]+$/, "Short ID must be lowercase hexadecimal"),
});

module.exports = {
  loginSchema,
  registerSchema,
  adminCreateUserSchema,
  uploadIntentSchema,
  linkBodySchema,
  idParamSchema,
  tokenParamSchema,
  shortIdParamSchema,
};
