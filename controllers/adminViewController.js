/**
 * Admin View Controller.
 */

const asyncHandler = require('express-async-handler');
const linkService = require('../services/linkService');
const userPreferenceService = require('../services/userPreferenceService');
const LinkPresenter = require('../presenters/linkPresenter');

/**
 * Renders the Main Dashboard.
 */
const renderDashboard = asyncHandler(async (req, res) => {
  const stats = await linkService.getStats(req.session);
  res.render('admin/dashboard', { title: 'Dashboard', stats });
});

/**
 * Renders the "My Downloads" List Page.
 */
const renderListPage = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 50;
  const search = req.query.search || null;
  const status = req.query.status || 'all';

  // Parse date filters if provided
  let dateFrom = null;
  let dateTo = null;
  if (req.query.dateFrom) {
    dateFrom = new Date(req.query.dateFrom).getTime();
  }
  if (req.query.dateTo) {
    // Set to end of day for dateTo
    const date = new Date(req.query.dateTo);
    date.setHours(23, 59, 59, 999);
    dateTo = date.getTime();
  }

  const result = await linkService.getAllLinks(req.session, {
    page,
    limit,
    search,
    status,
    dateFrom,
    dateTo
  });

  // Transform raw DB entities into View Models
  const links = result.links.map(LinkPresenter.toViewModel);

  res.render('admin/list', {
    title: 'My Downloads',
    links,
    pagination: result.pagination,
    filters: result.filters
  });
});

/**
 * Renders the Trash Can Page.
 */
const renderTrashPage = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 50;
  const search = req.query.search || null;

  const result = await linkService.getDeletedLinks(req.session, {
    page,
    limit,
    search
  });

  // Use specific Trash View Model for retention calculations
  const links = result.links.map(LinkPresenter.toTrashViewModel);

  res.render('admin/trash', {
    title: 'Trash Can',
    links,
    pagination: result.pagination,
    filters: result.filters
  });
});

/**
 * Renders the "New Download" Form.
 * Loads user preferences for default expiry and landing page settings.
 */
const renderNewLinkForm = asyncHandler(async (req, res) => {
  const preferences = await userPreferenceService.getAllPreferences(req.session.userId);

  res.render('admin/new', {
    title: 'New Download',
    preferences
  });
});

/**
 * Renders the "Edit Download" Form.
 */
const renderEditLinkForm = asyncHandler(async (req, res) => {
  const link = await linkService.getLinkById(req.params.id, req.session);
  res.render('admin/edit', { title: 'Edit Download', link });
});

module.exports = {
  renderDashboard,
  renderListPage,
  renderTrashPage,
  renderNewLinkForm,
  renderEditLinkForm
};
