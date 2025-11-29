/**
 * Test Using Dependency Injection.
 *
 * This file demonstrates how to use the DI container for testing
 */

const container = require('../container');
const AuthService = require('../services/authService');

/**
 * Testing AuthService with Mock Repository
 */
async function testAuthServiceLogin() {
  // Create mock user repository
  const mockUserRepository = {
    findByUsername: async (username) => {
      if (username === 'testuser') {
        return {
          id: '123',
          username: 'testuser',
          password_hash: '$2b$12$mockhashedpassword',
          status: 'active',
          role: 'user'
        };
      }
      return null;
    },
    update: async (id, data) => {
      console.log(`Mock: Updated user ${id}`, data);
      return true;
    }
  };

  // Create mock logger
  const mockLogger = {
    info: (msg) => console.log('[TEST]', msg),
    warn: (msg) => console.log('[TEST]', msg),
    error: (msg) => console.log('[TEST]', msg)
  };

  // Create AuthService instance with mocks using the container
  const authService = container.createWithMocks('authService', {
    userRepository: mockUserRepository,
    logger: mockLogger
  });

  // OR create directly with constructor
  // const authService = new AuthService(mockUserRepository, mockLogger);

  console.log('✅ AuthService instantiated with mocked dependencies');

  // Test registration
  try {
    await authService.register('newuser', 'StrongPass123!');
    console.log('✅ Registration test passed');
  } catch (err) {
    console.log('❌ Registration test failed:', err.message);
  }
}

/**
 * Using Spies to Track Method Calls
 */
async function testWithSpies() {
  let findByUsernameCalled = false;
  let updateCalled = false;

  const spyUserRepository = {
    findByUsername: async (username) => {
      findByUsernameCalled = true;
      console.log(`📞 Spy: findByUsername called with '${username}'`);
      return null; // User doesn't exist
    },
    create: async (userData) => {
      console.log(`📞 Spy: create called with`, userData);
      return { id: 'new-id', ...userData };
    },
    update: async (id, data) => {
      updateCalled = true;
      console.log(`📞 Spy: update called for user ${id}`);
      return true;
    },
    count: async () => 0
  };

  const spyLogger = {
    info: (...args) => console.log('📞 Spy Logger:', ...args),
    warn: (...args) => console.log('📞 Spy Logger:', ...args),
    error: (...args) => console.log('📞 Spy Logger:', ...args)
  };

  const authService = new AuthService(spyUserRepository, spyLogger);

  // Test
  await authService.register('spytest', 'Password123!');

  console.log('\nVerify spy calls:');
  console.log(`findByUsername was called: ${findByUsernameCalled}`);
  console.log(`update was called: ${updateCalled}`);
}

/**
 * Testing Error Scenarios
 */
async function testErrorScenarios() {
  const errorRepository = {
    findByUsername: async () => {
      throw new Error('Database connection failed');
    }
  };

  const mockLogger = {
    info: () => {},
    warn: () => {},
    error: (obj, msg) => console.log(`🚨 Error logged: ${msg}`, obj)
  };

  const authService = new AuthService(errorRepository, mockLogger);

  try {
    await authService.login('testuser', 'password');
    console.log('❌ Should have thrown error');
  } catch (err) {
    console.log('✅ Error handling works:', err.message);
  }
}

/**
 * Integration Test (Real Dependencies)
 */
async function testWithRealDependencies() {
  // Resolve from container - gets real dependencies
  const authService = container.resolve('authService');

  console.log('✅ AuthService resolved from container with real dependencies');
  console.log('   - Has userRepository:', !!authService.userRepository);
  console.log('   - Has logger:', !!authService.logger);
}

// Run Examples

async function runExamples() {
  console.log('========================================');
  console.log('Dependency Injection Testing Examples');
  console.log('========================================\n');

  console.log('Testing with Mocked Dependencies');
  console.log('--------------------------------------------');
  await testAuthServiceLogin();

  console.log('\n\nUsing Spies');
  console.log('--------------------------------------------');
  await testWithSpies();

  console.log('\n\nTesting Error Scenarios');
  console.log('--------------------------------------------');
  await testErrorScenarios();

  console.log('\n\nIntegration Test (Real Dependencies)');
  console.log('--------------------------------------------');
  await testWithRealDependencies();

  console.log('\n\n========================================');
  console.log('All testimg completed!');
  console.log('========================================');
}

// Run if executed directly
if (require.main === module) {
  runExamples().catch(console.error);
}

module.exports = {
  testAuthServiceLogin,
  testWithSpies,
  testErrorScenarios,
  testWithRealDependencies
};
