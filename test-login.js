/**
 * Test script to verify login functionality
 */

const authService = require('./services/authService').instance;

async function testLogin() {
  try {
    console.log('Testing login with admin credentials...');

    const user = await authService.login('admin', 'admin123');

    console.log('✅ Login successful!');
    console.log('User:', { id: user.id, username: user.username, role: user.role });

    process.exit(0);
  } catch (error) {
    console.error('❌ Login failed:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

testLogin();
