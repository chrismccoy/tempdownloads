/**
 * Link Presenter.
 *
 * Responsible for formatting raw database entities into View Models.
 */

const config = require('../config');
const { encrypt } = require('../utils/encryption');

class LinkPresenter {

  /**
   * Transforms a raw Link entity into a View Model for the main "My Downloads" list.
   */
  static toViewModel(link) {
    return {
      id: link.id,
      original_name: link.original_name,
      visit_count: link.visit_count,
      download_count: link.download_count,
      expires_at: link.expires_at,

      // Derived boolean for quick UI status checks
      is_expired: link.expires_at && link.expires_at < Date.now(),

      // Public Landing Page URL
      // Only generated if the user enabled the landing page feature
      landing_page_url: link.has_landing_page && link.short_id
        ? `${config.appUrl}/download/${link.short_id}`
        : 'N/A',
      // Direct Download URL
      // Contains an encrypted token with ID and Expiry logic
      direct_download_url: `${config.appUrl}/d/${encrypt({
        id: link.id,
        exp: link.expires_at,
      })}`
    };
  }

  /**
   * Transforms a raw Link entity into a View Model for the "Trash Can" list.
   */
  static toTrashViewModel(link) {
    return {
      id: link.id,
      original_name: link.original_name,
      deleted_at: link.deleted_at,
      expires_at: link.expires_at,
      visit_count: link.visit_count,
      download_count: link.download_count,

      // Calculate "Days Remaining" until auto-purge based on Config
      // Formula: (DeletedDate + RetentionDays) - Now
      days_until_purge: Math.max(0, Math.ceil(
        ( (link.deleted_at + (config.trashRetentionDays * 86400000)) - Date.now() ) / 86400000
      ))
    };
  }
}

module.exports = LinkPresenter;
