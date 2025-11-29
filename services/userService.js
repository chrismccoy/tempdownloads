/**
 * User Service.
 */

const { NotFoundError, AppError } = require('../utils/AppError');
const { ERROR_CODES } = require('../constants');

class UserService {
  constructor(userRepository) {
    this.userRepository = userRepository;
  }

  /**
   * Retrieves a list of all registered users.
   *
   * Used by the Admin Dashboard for user management tables.
   */
  async getAllUsers() {
    return this.userRepository.findAll();
  }

  /**
   * Approves a pending user registration.
   *
   * Changes the user status from 'pending' to 'active', allowing login.
   */
  async approveUser(userId) {
    const user = await this.userRepository.findById(userId);
    if (!user) throw new NotFoundError('User not found', ERROR_CODES.USER_NOT_FOUND);

    return this.userRepository.update(userId, { status: 'active' });
  }

  /**
   * Revokes a user's access (Ban).
   *
   * Changes status to 'revoked', preventing future logins immediately.
   * Includes a Safety Lock to prevent Admins from accidentally banning themselves.
   */
  async revokeUser(targetUserId, currentAdminId) {
    // Safety Check: Self-Banning Prevention
    if (targetUserId === currentAdminId) {
      throw new AppError("Safety Lock: You cannot revoke your own account access.", 403, ERROR_CODES.FORBIDDEN);
    }

    const user = await this.userRepository.findById(targetUserId);
    if (!user) throw new NotFoundError('User not found', ERROR_CODES.USER_NOT_FOUND);

    return this.userRepository.update(targetUserId, { status: 'revoked' });
  }

  /**
   * Promotes a standard user to an Administrator.
   *
   * Grants full system privileges (User management, Audit logs, etc.).
   */
  async promoteToAdmin(userId) {
    const user = await this.userRepository.findById(userId);
    if (!user) throw new NotFoundError('User not found', ERROR_CODES.USER_NOT_FOUND);

    return this.userRepository.update(userId, { role: 'admin' });
  }
}

module.exports = UserService;
