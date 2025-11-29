/**
 * TempDownloads Key Generator Script.
 *
 * This utility is designed to bootstrap the application's security configuration.
 * It generates cryptographically secure pseudo-random numbers (CSPRNG) suitable
 * for use as session secrets, encryption keys, and initialization vectors.
 */

const crypto = require('crypto');

/**
 * Generates a cryptographically secure random hex string.
 */
function generateSecret(bytes) {
  return crypto.randomBytes(bytes).toString('hex');
}

// --- Script Execution ---

console.log('\n📦 TempDownloads Security Configuration Generator');
console.log('=================================================\n');
console.log('Copy the values below and paste them into your .env file:\n');

// Generate Session Secret
// Used by express-session to sign the session ID cookie, preventing tampering.
// Requires high entropy (at least 32 bytes / 256 bits recommended).
console.log(`# Session Signing Secret`);
console.log(`SESSION_SECRET=${generateSecret(32)}\n`);

// Generate Encryption Keys
// Used for AES-256-GCM encryption of files and tokens.
// We generate two keys here to demonstrate the Key Rotation format used by config/index.js.
const primaryKey = generateSecret(32); // 32 bytes = 256 bits (Standard for AES-256)
const backupKey = generateSecret(32);

console.log(`# AES-256 Encryption Keys`);
console.log(`# For a fresh install, you only need one.`);
console.log(`ENCRYPTION_KEYS=${primaryKey}`);
console.log(`# To rotate later, generate a new key and move the old key behind a comma like this:`);
// This output demonstrates how the config parser handles comma-separated values for rotation
console.log(`# ENCRYPTION_KEYS=${backupKey},${primaryKey}\n`);

// Generate Initialization Vector (IV)
// AES-GCM requires a unique IV (Salt) to ensure the same data encrypts differently every time.
// This app uses a global IV salt for key derivation consistency.
// Must be exactly 16 bytes (32 hex characters) for the application config schema.
console.log(`# AES Initialization Vector`);
console.log(`ENCRYPTION_IV=${generateSecret(16)}\n`);

// Footer Warning
console.log('=================================================');
console.log('⚠️  WARNING: Keep these keys secret. Do not commit them to version control.');
