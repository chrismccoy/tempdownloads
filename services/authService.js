/**
 * Authentication Service
 */

const config = require('../config');
const { AuthenticationError, AppError } = require('../utils/AppError');
const { hashPassword, verifyPassword, generateDummyHash } = require('../utils/passwordHash');
const { ERROR_CODES } = require('../constants');

class AuthService {
  /**
   * Creates AuthService with injected dependencies.
   */
  constructor(userRepository, logger) {
    this.userRepository = userRepository;
    this.logger = logger;
  }

  /**
   * Registers a new user via the public form.
   *
   * Defaults status to 'pending' so an Admin must approve them before login.
   * Enforces unique usernames and email addresses.
   */
  async register(username, email, password, passwordConfirm) {
    // Validate password confirmation
    if (password !== passwordConfirm) {
      throw new AppError('Password confirmation does not match', 400, ERROR_CODES.VALIDATION_ERROR);
    }

    // Check username uniqueness
    const existingUsername = await this.userRepository.findByUsername(username);
    if (existingUsername) {
      throw new AppError('Username already taken', 400, ERROR_CODES.USERNAME_TAKEN);
    }

    // Check email uniqueness
    const existingEmail = await this.userRepository.findByEmail(email);
    if (existingEmail) {
      throw new AppError('Email address is already registered', 400, ERROR_CODES.EMAIL_TAKEN);
    }

    const hash = await hashPassword(password);

    await this.userRepository.create({
      username,
      email,
      password_hash: hash,
      role: 'user',
      status: 'pending' // Approval required
    });
  }

  /**
   * Creates a user directly from the Admin Panel.
   *
   * Allows setting Roles (Admin/User) and defaults status to 'active' (Pre-approved).
   */
  async adminCreateUser(username, password, role) {
    const existing = await this.userRepository.findByUsername(username);
    if (existing) throw new AppError('Username already taken', 400, ERROR_CODES.USERNAME_TAKEN);

    const hash = await hashPassword(password);

    await this.userRepository.create({
      username,
      password_hash: hash,
      role: role,
      status: 'active' // Skip approval workflow
    });
  }

  /**
   * Validates User Credentials for Login.
   *
   * Checks:
   * 1. Username exists.
   * 2. Password matches hash.
   * 3. Account Status is 'active' (not pending/revoked).
   */
  async login(username, password) {
    const user = await this.userRepository.findByUsername(username);

    const DUMMY_HASH = '$2b$10$WS3ZQneA44nlvxQC.DlC1uFcuEwaWVDY3AbRE1G9OhwRIibGLEiHy';

    const hashToCompare = user ? user.password_hash : DUMMY_HASH;

    // Always perform bcrypt comparison regardless of user existence
    const isValid = await verifyPassword(password, hashToCompare);

    // Check both user existence and password validity together
    if (!user || !isValid) {
      throw new AuthenticationError('Invalid credentials', ERROR_CODES.INVALID_CREDENTIALS);
    }

    // Status Checks (only after confirming user exists and password is valid)
    if (user.status === 'pending') {
      throw new AuthenticationError('Account is pending approval from an administrator.', ERROR_CODES.ACCOUNT_PENDING);
    }

    if (user.status === 'revoked') {
      throw new AuthenticationError('Account access has been revoked.', ERROR_CODES.ACCOUNT_REVOKED);
    }

    // Update Last Login Timestamp
    await this.userRepository.update(user.id, { last_login_at: Date.now() });

    return user;
  }

  /**
   * Ensures Default Admin exists.
   *
   * Runs on server startup. If the User table is empty, creates the first
   * Admin account using credentials from `.env`.
   */
  async ensureDefaultAdmin() {
    try {
      const count = await this.userRepository.count();

      if (count === 0) {
        this.logger.info('🌱 [SEED] No users found. Creating initial Admin account...');

        const hash = await hashPassword(config.seed.password);

        await this.userRepository.create({
          username: config.seed.username,
          password_hash: hash,
          role: 'admin',
          status: 'active'
        });

        this.logger.info(`✅ [SEED] Admin '${config.seed.username}' created. Password set from config.`);
      }
    } catch (error) {
      // Log error but allow app to start (e.g., DB might be locked)
      this.logger.error({ err: error }, '❌ [SEED] Failed to seed default admin.');
    }
  }
}

module.exports = AuthService;

