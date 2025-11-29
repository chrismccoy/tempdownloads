/**
 * Dependency Injection Container.
 *
 * A simple, lightweight DI container that manages application dependencies.
 */

const path = require('path');

class Container {
  constructor() {
    this.services = new Map();
    this.singletons = new Map();
    this.resolving = new Set(); // For circular dependency detection
  }

  /**
   * Registers a service factory function.
   */
  register(name, factory, options = {}) {
    const { singleton = true } = options;

    this.services.set(name, {
      factory,
      singleton,
      dependencies: [] // Can be extracted from factory if needed
    });
  }

  /**
   * Registers an existing instance.
   */
  registerInstance(name, instance) {
    this.singletons.set(name, instance);
  }

  /**
   * Resolves and returns a service instance.
   */
  resolve(name) {
    // Check if already instantiated (singleton)
    if (this.singletons.has(name)) {
      return this.singletons.get(name);
    }

    // Check if service is registered
    if (!this.services.has(name)) {
      throw new Error(`Service '${name}' not registered in container`);
    }

    // Circular dependency detection
    if (this.resolving.has(name)) {
      throw new Error(`Circular dependency detected: ${name} -> ${Array.from(this.resolving).join(' -> ')} -> ${name}`);
    }

    const service = this.services.get(name);
    this.resolving.add(name);

    try {
      // Create instance using factory
      const instance = service.factory(this);

      // Cache if singleton
      if (service.singleton) {
        this.singletons.set(name, instance);
      }

      return instance;
    } finally {
      this.resolving.delete(name);
    }
  }

  /**
   * Checks if a service is registered.
   */
  has(name) {
    return this.services.has(name) || this.singletons.has(name);
  }

  /**
   * Clears all singletons (useful for testing).
   */
  clearSingletons() {
    this.singletons.clear();
  }

  /**
   * Resets the entire container.
   */
  reset() {
    this.services.clear();
    this.singletons.clear();
    this.resolving.clear();
  }
}

// Create global container instance
const container = new Container();

// Configuration
container.registerInstance('config', require('./config'));

// Database
container.registerInstance('db', require('./db/database'));

// Transaction utilities
container.registerInstance('transaction', require('./db/transaction'));

// Logger
container.registerInstance('logger', require('./utils/logger'));

// Utilities

container.register('fileSanitizer', (c) => require('./utils/fileSanitizer'));
container.register('passwordHash', (c) => require('./utils/passwordHash'));
container.register('sanitizer', (c) => require('./utils/sanitizer'));
container.register('queryCache', (c) => require('./utils/queryCache'));

// Repositories

container.register('userRepository', (c) => {
  const UserRepository = require('./repositories/userRepository');
  const db = c.resolve('db');
  return new UserRepository(db);
});

container.register('linkRepository', (c) => {
  const LinkRepository = require('./repositories/linkRepository');
  const db = c.resolve('db');
  return new LinkRepository(db);
});

container.register('userPreferenceRepository', (c) => {
  const UserPreferenceRepository = require('./repositories/userPreferenceRepository');
  const db = c.resolve('db');
  return new UserPreferenceRepository(db);
});

// Services

// Storage Service
container.register('storageService', (c) => require('./services/storageService'));

// Auth Service
container.register('authService', (c) => {
  const AuthService = require('./services/authService');
  const userRepository = c.resolve('userRepository');
  const logger = c.resolve('logger');
  return new AuthService(userRepository, logger);
});

// Link Service
container.register('linkService', (c) => {
  return require('./services/linkService');
});

// Audit Service
container.register('auditService', (c) => {
  const AuditService = require('./services/auditService');
  const db = c.resolve('db');
  const logger = c.resolve('logger');
  return new AuditService(db, logger);
});

// User Service
container.register('userService', (c) => {
  const UserService = require('./services/userService');
  const userRepository = c.resolve('userRepository');
  return new UserService(userRepository);
});

// Upload Service
container.register('uploadService', (c) => {
  const UploadService = require('./services/uploadService');
  const storageService = c.resolve('storageService');
  return new UploadService(storageService);
});

// Email Service
container.register('emailService', (c) => {
  const EmailService = require('./services/emailService');
  const logger = c.resolve('logger');
  return new EmailService(logger);
});

// Password Reset Service
container.register('passwordResetService', (c) => {
  const PasswordResetService = require('./services/passwordResetService');
  const db = c.resolve('db');
  const userRepository = c.resolve('userRepository');
  const logger = c.resolve('logger');
  return new PasswordResetService(db, userRepository, logger);
});

// Controllers

container.register('authController', (c) => {
  const authController = require('./controllers/authController');
  return authController;
});

container.register('publicController', (c) => {
  const publicController = require('./controllers/publicController');
  return publicController;
});

container.register('adminViewController', (c) => {
  const adminViewController = require('./controllers/adminViewController');
  return adminViewController;
});

container.register('adminApiController', (c) => {
  const adminApiController = require('./controllers/adminApiController');
  return adminApiController;
});

container.register('adminUserController', (c) => {
  const adminUserController = require('./controllers/adminUserController');
  return adminUserController;
});

container.register('passwordResetController', (c) => {
  const passwordResetController = require('./controllers/passwordResetController');
  const passwordResetService = c.resolve('passwordResetService');
  const emailService = c.resolve('emailService');
  // Initialize controller with services
  passwordResetController.init(passwordResetService, emailService);
  return passwordResetController;
});

/**
 * Creates a factory function for testing that accepts mock dependencies.
 */
container.createWithMocks = function(serviceName, mocks = {}) {
  const testContainer = new Container();

  // Copy registrations from main container
  this.services.forEach((value, key) => {
    testContainer.services.set(key, value);
  });

  // Override with mocks
  Object.entries(mocks).forEach(([name, instance]) => {
    testContainer.registerInstance(name, instance);
  });

  return testContainer.resolve(serviceName);
};

module.exports = container;
