/** @type {import('tailwindcss').Config} */

module.exports = {

  /**
   * Content Paths.
   */
  content: [
    './views/**/*.ejs',        // Scan all EJS templates in views folder
    './public/js/**/*.js'      // Scan client-side JS (e.g., Admin Components)
  ],

  /**
   * Theme Customization.
   */
  theme: {
    extend: {
      /**
       * Custom Font Families.
       * Adds a 'mono' stack that prioritizes 'Space Mono' (loaded in header.ejs).
       * Usage: class="font-mono"
       */
      fontFamily: {
        mono: ['"Space Mono"', 'monospace'],
      },
    },
  },

  /**
   * Plugins.
   */
  plugins: [
    // require('@tailwindcss/forms'),
    // require('@tailwindcss/typography'),
  ],
};
