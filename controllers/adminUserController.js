/**
 * Admin User Management Controller.
 */

const asyncHandler = require('express-async-handler');
const container = require('../container');
const ApiResponse = require('../utils/apiResponse');

// Resolve dependencies from container
const userService = container.resolve('userService');
const authService = container.resolve('authService');

/**
 * Renders the list of all users.
 */
const renderUserList = asyncHandler(async (req, res) => {
  const users = await userService.getAllUsers();
  res.render('admin/users', { title: 'User Management', users });
});

/**
 * Renders the 'Add New User' form.
 */
const renderNewUserForm = (req, res) => {
  res.render('admin/users_new', { title: 'Add User', error: null });
};

/**
 * Handles the creation of a new user by an Admin.
 */
const createUser = asyncHandler(async (req, res) => {
  const { username, password, isAdmin } = req.body;

  // Determine role based on checkbox input
  const role = (isAdmin === 'on' || isAdmin === true) ? 'admin' : 'user';

  try {
    await authService.adminCreateUser(username, password, role);
    res.redirect('/admin/users');
  } catch (error) {
    // If creation fails (e.g., username taken), re-render form with error
    res.render('admin/users_new', {
      title: 'Add User',
      error: error.message
    });
  }
});

/**
 * Approves a pending user registration.
 */
const approveUser = asyncHandler(async (req, res) => {
  await userService.approveUser(req.params.id);
  ApiResponse.success(res, 'User approved successfully');
});

/**
 * Revokes access for a user (Ban).
 */
const revokeUser = asyncHandler(async (req, res) => {
  await userService.revokeUser(req.params.id, req.session.userId);
  ApiResponse.success(res, 'User access revoked');
});

/**
 * Promotes a user to Admin role.
 */
const promoteUser = asyncHandler(async (req, res) => {
  await userService.promoteToAdmin(req.params.id);
  ApiResponse.success(res, 'User promoted to Admin');
});

module.exports = {
  renderUserList,
  renderNewUserForm,
  createUser,
  approveUser,
  revokeUser,
  promoteUser
};
