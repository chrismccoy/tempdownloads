#!/usr/bin/env node
/**
 * Dependency Injection Verification Script.
 *
 * Verifies that the DI container is properly configured and all services
 * can be resolved without errors.
 *
 * Run with: node scripts/verify-di.js
 */

const container = require('../container');

console.log('========================================');
console.log('DI Container Verification');
console.log('========================================\n');

// List of services to verify
const servicesToVerify = [
  // Infrastructure
  { name: 'config', type: 'Instance' },
  { name: 'db', type: 'Instance' },
  { name: 'logger', type: 'Instance' },

  // Utilities
  { name: 'fileSanitizer', type: 'Service' },
  { name: 'passwordHash', type: 'Service' },
  { name: 'sanitizer', type: 'Service' },
  { name: 'queryCache', type: 'Service' },

  // Repositories
  { name: 'userRepository', type: 'Repository' },
  { name: 'linkRepository', type: 'Repository' },

  // Services
  { name: 'authService', type: 'Service' },
  { name: 'linkService', type: 'Service' },
  { name: 'auditService', type: 'Service' },
  { name: 'storageService', type: 'Service' },
  { name: 'uploadService', type: 'Service' },

  // Controllers
  { name: 'authController', type: 'Controller' },
  { name: 'publicController', type: 'Controller' },
  { name: 'adminViewController', type: 'Controller' },
  { name: 'adminApiController', type: 'Controller' },
  { name: 'adminUserController', type: 'Controller' }
];

let successCount = 0;
let failureCount = 0;
const failures = [];

console.log('Verifying service registrations...\n');

for (const { name, type } of servicesToVerify) {
  try {
    const service = container.resolve(name);

    if (!service) {
      console.log(`❌ ${type}: ${name} - Resolved to null/undefined`);
      failures.push({ name, error: 'Resolved to null/undefined' });
      failureCount++;
    } else {
      console.log(`✅ ${type}: ${name}`);
      successCount++;
    }
  } catch (err) {
    console.log(`❌ ${type}: ${name} - ${err.message}`);
    failures.push({ name, error: err.message });
    failureCount++;
  }
}

console.log('\n========================================');
console.log('Verification Summary');
console.log('========================================\n');

console.log(`Total Services: ${servicesToVerify.length}`);
console.log(`✅ Successful: ${successCount}`);
console.log(`❌ Failed: ${failureCount}`);

if (failureCount > 0) {
  console.log('\n❌ Failures:\n');
  failures.forEach(({ name, error }) => {
    console.log(`  - ${name}: ${error}`);
  });
  console.log('\n');
  process.exit(1);
} else {
  console.log('\n🎉 All services resolved successfully!\n');
  console.log('DI container is properly configured and ready for use.');
  console.log('\n========================================\n');
  process.exit(0);
}
