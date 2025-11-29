/**
 * Admin Dashboard Components (Alpine.js).
 */

document.addEventListener('alpine:init', () => {
  /**
   * File Uploader Component.
   */
  Alpine.data('fileUploader', (config) => ({
    file: null,
    isUploading: false,
    progress: 0,
    error: '',

    // Form Fields
    expiry: config.initialExpiry !== undefined ? config.initialExpiry : '3600',
    customExpiry: config.initialCustomExpiry || '',
    landingPage: config.initialLandingPage || false,
    password: '',
    burnAfterRead: config.initialBurnAfterRead || false,

    // Flags
    encryptionEnabled: true,

    /**
     * Client-side File Validation.
     * Checks strict size limits before attempting upload.
     */
    validateFile(file) {
      this.error = '';
      if (!file) return true;

      // 500MB Hard Limit (matches server config)
      if (file.size > 500 * 1024 * 1024) {
        this.error = 'File is too large (Max 500MB)';
        return false;
      }
      return true;
    },

    /**
     * Form Submission Handler.
     * Handles the entire async upload pipeline.
     */
    async handleSubmit() {
      if (this.error) return alert(this.error);

      // Validation: Create mode requires a file
      if (config.mode === 'create' && !this.file) return alert('Please select a file.');

      this.isUploading = true;
      let storageKey = null;
      let originalName = null;
      let checksum = null;
      let isEncrypted = false;

      try {
        // File Upload (If a new file is selected) ---
        if (this.file) {
          originalName = this.file.name;

          // Get Upload from Backend
          const intentRes = await fetch('/admin/api/get-upload-intent', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-csrf-token': config.csrfToken },
            body: JSON.stringify({
              filename: this.file.name,
              mimetype: this.file.type || 'application/octet-stream'
            })
          });

          if(!intentRes.ok) throw new Error('Failed to initialize upload intent');
          const intent = await intentRes.json();
          const uploadData = intent.data;

          // Perform Binary Upload via XHR (for Progress Events)
          await new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open(uploadData.method, uploadData.url);

            // Append any required Cloud Headers (e.g., x-ms-blob-type)
            if (uploadData.headers) {
              Object.entries(uploadData.headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));
            }

            // Logic Fork: Local vs Cloud
            if (uploadData.provider === 'local') {
              // Local: Use FormData to pipe through internal proxy
              const fd = new FormData();
              fd.append('file', this.file);
              xhr.setRequestHeader('x-csrf-token', config.csrfToken);

              xhr.upload.onprogress = (e) => {
                if(e.lengthComputable) this.progress = Math.round((e.loaded/e.total)*100);
              };

              xhr.onload = () => {
                 if(xhr.status >= 200 && xhr.status < 300) {
                   try {
                     const resp = JSON.parse(xhr.responseText);
                     // Capture backend-generated metadata (checksums/encryption status)
                     storageKey = resp.data.key;
                     checksum = resp.data.checksum;
                     isEncrypted = resp.data.isEncrypted;
                     resolve();
                   } catch(e) { reject(new Error('Invalid server response (JSON parse failed)')); }
                 } else {
                   try {
                     reject(new Error(JSON.parse(xhr.responseText).error || 'Upload failed'));
                   } catch(e) { reject(new Error('Upload failed')); }
                 }
              };
              xhr.onerror = () => reject(new Error('Network error during upload'));
              xhr.send(fd);
            } else {
              // Cloud: PUT raw binary directly to S3/Azure
              xhr.upload.onprogress = (e) => {
                if(e.lengthComputable) this.progress = Math.round((e.loaded/e.total)*100);
              };

              xhr.onload = () => (xhr.status >= 200 && xhr.status < 300)
                ? resolve()
                : reject(new Error('Cloud upload failed'));

              xhr.onerror = () => reject(new Error('Network error during cloud upload'));

              xhr.send(this.file);
              storageKey = uploadData.key;
            }
          });
        }

        // Create/Update Link Record
        const payload = {
          expiry: this.expiry,
          custom_expiry: this.customExpiry,
          has_landing_page: this.landingPage,
          password: this.password,
          burn_after_read: this.burnAfterRead,
          checksum: checksum,
          is_encrypted: isEncrypted
        };

        // Only attach file info if a new file was uploaded
        if (storageKey) {
          payload.key = storageKey;
          payload.original_name = originalName;
        }

        const finalRes = await fetch(config.submitUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-csrf-token': config.csrfToken },
          body: JSON.stringify(payload)
        });

        // Error Handling for Server Crashes (HTML responses)
        const textResponse = await finalRes.text();
        let finalData;

        try {
          finalData = JSON.parse(textResponse);
        } catch (e) {
          // Scrape H2 from Error Page if JSON fails
          const match = textResponse.match(/<h2.*?>(.*?)<\/h2>/s);
          const errMessage = match ? match[1].trim() : 'Server Error (Invalid JSON response)';
          throw new Error(errMessage);
        }

        if (finalData.success) {
          window.location.href = finalData.data.redirectTo;
        } else {
          throw new Error(finalData.error || 'Failed to save link');
        }

      } catch (err) {
        alert('System Error: ' + err.message);
        console.error(err);
        this.isUploading = false;
        this.progress = 0;
      }
    }
  }));

  /**
   * List Item Component.
   */
  Alpine.data('listItem', (config) => ({
    showConfirm: false,
    isDeleting: false,
    showQr: false,
    qrUrl: '',

    btnLpText: 'Copy',
    btnDlText: 'Copy',

    /**
     * Copies URL to clipboard and updates specific button text temporarily.
     */
    copyToClipboard(text, type) {
      navigator.clipboard.writeText(text).then(() => {
        this[type] = 'Copied!';
        setTimeout(() => this[type] = 'Copy', 2000);
      });
    },

    /**
     * Generates and displays a QR Code for the given URL.
     * Caches the result to avoid re-fetching.
     */
    async generateQr(url) {
      this.showQr = true;
      if (this.qrUrl) return; // Use cached URL if available

      try {
        const res = await fetch(`/admin/api/qr?url=${encodeURIComponent(url)}`);
        const data = await res.json();
        if(data.success) {
           this.qrUrl = data.data.dataUrl;
        }
      } catch(e) {
        console.error('QR Gen Failed', e);
      }
    },

    /**
     * Soft Deletes the link (AJAX).
     */
    async deleteLink() {
      this.isDeleting = true;
      try {
        const res = await fetch(`/admin/links/${config.id}`, {
          method: 'DELETE',
          headers: { 'Accept': 'application/json', 'x-csrf-token': config.csrfToken }
        });

        if (res.ok) {
          this.$dispatch('link-deleted');
          this.$el.closest('tr').remove();
        } else {
          alert('Error deleting link');
          this.isDeleting = false;
        }
      } catch (e) {
        alert('Network error');
        this.isDeleting = false;
      }
    }
  }));

  /**
   * Trash Item Component.
   */
  Alpine.data('trashItem', (config) => ({
    showConfirm: false,
    isProcessing: false,

    /**
     * Restores a soft-deleted link.
     */
    async restoreLink() {
      this.isProcessing = true;
      try {
        const res = await fetch(`/admin/links/${config.id}/restore`, {
          method: 'PATCH',
          headers: { 'Accept': 'application/json', 'x-csrf-token': config.csrfToken }
        });
        if (res.ok) {
          this.$dispatch('link-restored');
          this.$el.closest('tr').remove();
        } else {
          alert('Error restoring link');
          this.isProcessing = false;
        }
      } catch (e) { alert('Network error'); this.isProcessing = false; }
    },

    /**
     * Permanently deletes a link and its physical file.
     */
    async forceDelete() {
      this.isProcessing = true;
      try {
        const res = await fetch(`/admin/links/${config.id}/force`, {
          method: 'DELETE',
          headers: { 'Accept': 'application/json', 'x-csrf-token': config.csrfToken }
        });
        if (res.ok) {
          this.$dispatch('link-purged');
          this.$el.closest('tr').remove();
        } else {
          alert('Error deleting permanently');
          this.isProcessing = false;
        }
      } catch (e) { alert('Network error'); this.isProcessing = false; }
    }
  }));

  /**
   * Batch Operations Component (for list and trash views).
   */
  Alpine.data('batchOperations', () => ({
    selectedIds: [],
    linkCount: 0,
    toast: {
      show: false,
      message: '',
      type: 'success'
    },
    confirm: {
      show: false,
      title: '',
      message: '',
      action: null,
      isDanger: false
    },

    init() {
      // Initialize linkCount from the page
      this.linkCount = document.querySelectorAll('tbody tr').length;
    },

    /**
     * Shows a toast notification.
     */
    showToast(message, type = 'success') {
      this.toast.message = message;
      this.toast.type = type;
      this.toast.show = true;

      // Auto-hide after 4 seconds
      setTimeout(() => {
        this.toast.show = false;
      }, 4000);
    },

    /**
     * Shows a confirmation dialog.
     */
    showConfirm(title, message, action, isDanger = false) {
      this.confirm.title = title;
      this.confirm.message = message;
      this.confirm.action = action;
      this.confirm.isDanger = isDanger;
      this.confirm.show = true;
    },

    /**
     * Handles confirmation dialog response.
     */
    handleConfirm(confirmed) {
      if (confirmed && this.confirm.action) {
        this.confirm.action();
      }
      this.confirm.show = false;
      this.confirm.action = null;
    },

    /**
     * Check if a specific ID is selected.
     */
    isSelected(id) {
      return this.selectedIds.includes(id);
    },

    /**
     * Toggle selection for a specific link.
     */
    toggleSelection(id) {
      const index = this.selectedIds.indexOf(id);
      if (index === -1) {
        this.selectedIds.push(id);
      } else {
        this.selectedIds.splice(index, 1);
      }
    },

    /**
     * Toggle all checkboxes.
     */
    toggleAll(event) {
      if (event.target.checked) {
        // Select all visible rows and get their link IDs
        const rows = document.querySelectorAll('tbody tr[data-link-id]');
        this.selectedIds = Array.from(rows).map(row => row.getAttribute('data-link-id'));
      } else {
        this.selectedIds = [];
      }
    },

    /**
     * Clear all selections.
     */
    clearSelection() {
      this.selectedIds = [];
    },

    /**
     * Batch delete (move to trash).
     */
    batchDelete() {
      if (this.selectedIds.length === 0) return;

      this.showConfirm(
        'Move to Trash',
        `Move ${this.selectedIds.length} item(s) to trash?`,
        () => this.executeBatchDelete()
      );
    },

    /**
     * Executes batch delete after confirmation.
     */
    async executeBatchDelete() {
      try {
        const csrfToken = document.querySelector('meta[name="csrf-token"]').getAttribute('content');
        const res = await fetch('/admin/links/batch/delete', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'x-csrf-token': csrfToken
          },
          body: JSON.stringify({ ids: this.selectedIds })
        });

        const data = await res.json();

        if (data.success) {
          this.showToast(data.message, 'success');
          // Remove deleted rows from DOM
          this.selectedIds.forEach(id => {
            const row = document.querySelector(`tr[data-link-id="${id}"]`);
            if (row) {
              row.remove();
              this.linkCount--;
              this.$dispatch('link-deleted');
            }
          });
          this.selectedIds = [];
        } else {
          this.showToast('Error: ' + data.message, 'error');
        }
      } catch (e) {
        this.showToast('Network error: ' + e.message, 'error');
      }
    },

    /**
     * Batch restore (from trash).
     */
    batchRestore() {
      if (this.selectedIds.length === 0) return;

      this.showConfirm(
        'Restore Items',
        `Restore ${this.selectedIds.length} item(s) from trash?`,
        () => this.executeBatchRestore()
      );
    },

    /**
     * Executes batch restore after confirmation.
     */
    async executeBatchRestore() {
      try {
        const csrfToken = document.querySelector('meta[name="csrf-token"]').getAttribute('content');
        const res = await fetch('/admin/links/batch/restore', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'x-csrf-token': csrfToken
          },
          body: JSON.stringify({ ids: this.selectedIds })
        });

        const data = await res.json();

        if (data.success) {
          this.showToast(data.message, 'success');
          // Remove restored rows from DOM
          this.selectedIds.forEach(id => {
            const row = document.querySelector(`tr[data-link-id="${id}"]`);
            if (row) {
              row.remove();
              this.linkCount--;
              this.$dispatch('link-restored');
            }
          });
          this.selectedIds = [];
        } else {
          this.showToast('Error: ' + data.message, 'error');
        }
      } catch (e) {
        this.showToast('Network error: ' + e.message, 'error');
      }
    },

    /**
     * Batch force delete (permanent).
     */
    batchForceDelete() {
      if (this.selectedIds.length === 0) return;

      this.showConfirm(
        'Permanent Delete',
        `PERMANENTLY delete ${this.selectedIds.length} item(s)? This cannot be undone!`,
        () => this.executeBatchForceDelete(),
        true // isDanger
      );
    },

    /**
     * Executes batch force delete after confirmation.
     */
    async executeBatchForceDelete() {
      try {
        const csrfToken = document.querySelector('meta[name="csrf-token"]').getAttribute('content');
        const res = await fetch('/admin/links/batch/force-delete', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'x-csrf-token': csrfToken
          },
          body: JSON.stringify({ ids: this.selectedIds })
        });

        const data = await res.json();

        if (data.success) {
          this.showToast(data.message, 'success');
          // Remove deleted rows from DOM
          this.selectedIds.forEach(id => {
            const row = document.querySelector(`tr[data-link-id="${id}"]`);
            if (row) {
              row.remove();
              this.linkCount--;
              this.$dispatch('link-purged');
            }
          });
          this.selectedIds = [];
        } else {
          this.showToast('Error: ' + data.message, 'error');
        }
      } catch (e) {
        this.showToast('Network error: ' + e.message, 'error');
      }
    }
  }));
});
