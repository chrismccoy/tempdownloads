# 📤 TempDownloads

Temp Downloads is a secure, self-hosted, multi-user platform for sharing time-sensitive files. It provides an admin dashboard where users can upload assets and generate unique, encrypted download links that automatically expire. Perfect for teams sharing digital assets, client deliverables, or sensitive documents with full control over access.

## Features

### Security & Authentication

- 🛂 **Multi-User Authentication:** Full authentication system supporting user registration, secure login, and administrator approval workflows (pending/active/revoked status).
- 🛡️ **Role-Based Access Control:** Granular permissions ensure regular users only see and manage their own files, while Super Admins have global oversight and user management tools.
- 🔑 **Password Reset:** Complete email-based password reset workflow with secure SHA-256 token hashing, 1-hour expiry, and email enumeration prevention.
- 📨 **Email Integration:** Multi-provider email support (console, sendmail, SMTP) with HTML templates for password resets and notifications.
- ⏳ **Secure, Expiring Links:** Create time-sensitive, tamper-proof, encrypted links that automatically expire after a configured period.
- 🔥 **Burn-on-Read:** Optional "Self-Destruct" mode. Links and files are permanently deleted immediately after the first successful download.
- 🔐 **Password Protection:** Add an extra layer of security by requiring a password to unlock specific download links with brute-force protection (5 attempts per 15 minutes).
- 🧱 **Encryption at Rest:** Local uploads are encrypted on-the-fly using **AES-256-GCM** before hitting the disk, ensuring physical theft protection.
- 🍪 **Session Encryption:** Session data is encrypted at rest using AES-256-GCM for additional security.
- 🛑 **Double-Submit CSRF:** Modern CSRF protection using the double-submit cookie pattern for all state-changing actions.
- 👷 **Strict CSP & Reporting:** Hardened Helmet configuration with strict Content Security Policy directives and a built-in violation reporting endpoint.
- 💪 **Strong Password Validation:** Enforced password strength requirements across registration and reset flows.
- 🧼 **Input Sanitization:** Comprehensive sanitization removing null bytes, HTML tags, path traversal attempts, and control characters.

### File Handling

- ⚡ **Stream Processing:** Optimized upload pipeline using Node.js Streams to handle large files with minimal memory footprint via Busboy.
- 🧩 **File Integrity Checksums:** Calculates **SHA-256** checksums during upload to verify file integrity and prevent corruption.
- 🪄 **Magic Byte Validation:** Security goes beyond file extensions. The system inspects the binary signature (Magic Bytes) of every upload to prevent spoofing and ensure file integrity.
- 👁️ **File Preview:** Built-in preview functionality for images (JPG, PNG, GIF, WebP, BMP, SVG), PDFs, text files (TXT, MD, LOG, CSV, JSON, XML), videos (MP4, WebM, OGG, MOV), and audio (MP3, WAV, OGG, M4A, AAC) with inline rendering.
- 🏎️ **Hybrid Storage Engine:** Smart upload logic that streams local files efficiently or utilizes Presigned URLs/SAS Tokens for direct-to-cloud uploads (S3/Azure) to bypass server bottlenecks.
- 🗂️ **Expanded File Type Support:** Natively supports `.zip`, `.7z`, `.pdf`, `.jpg`, `.png`, `.gif`, `.webp`, and many more file types.
- ♻️ **Failed Deletion Retry:** Automatic retry mechanism for failed file deletions with configurable retry count and tracking.

### Storage Providers

- 🌐 **Multi-Cloud Storage:** Native support for **AWS S3**, **Cloudflare R2**, **Azure Blob Storage**, and local disk storage, configurable via a simple environment variable.
- 🏠 **Local Storage:** Filesystem-based storage with encryption at rest and magic byte validation.
- 🪣 **AWS S3:** Direct presigned URL upload/download with configurable expiry (5-minute upload, 15-minute download).
- 🟦 **Azure Blob Storage:** SAS token-based upload/download with automatic container creation.
- 🤝 **S3-Compatible Services:** Support for MinIO, Cloudflare R2, and other S3-compatible endpoints.

### User Interface & Experience

- 🏗️ **Brutalist UI:** A sharp, functional interface built with Tailwind CSS.
- 🏔️ **Alpine.js Interactive UI:** Lightweight Alpine.js for a reactive, progressively enhanced user experience (handling uploads, progress bars, toast notifications, and UI state).
- ✂️ **Clean, Shareable URLs:** Landing pages use clean, human-readable URLs (e.g., `/download/a8c2efb1`) perfect for sharing, while the actual download is protected by a separate, secure token.
- 📱 **QR Code Generation:** Instantly generate QR codes for landing pages to easily transfer files to mobile devices.
- 🎨 **Flexible Download Experience:** Choose between a direct file download or a professional landing page for each link, displaying file name, size, and expiration.
- ⚙️ **User Preferences:** Customizable per-user settings including default expiration times, landing page preferences, items per page (5-100), and theme selection (light/dark).
- 🍞 **Toast Notifications:** Non-intrusive toast notifications for batch operations and preference saves.
- 💬 **Custom Confirmation Dialogs:** Styled confirmation modals replacing browser alerts for batch operations.

### Link Configuration

- 🗓️ **Custom Expiration:** Set a link to expire in minutes, hours, days, years, or choose a specific custom date and time. Links can also be set to never expire.
- 🗑️ **Trash & Recovery:** Deleted links are moved to a dedicated "Trash Can" UI instead of being lost immediately. Admins can restore files deleted by mistake or force a permanent deletion manually.
- 📦 **Batch Operations:** Efficiently manage multiple links with batch soft delete, hard delete, and restore operations with BullMQ job queuing and backpressure control.
- ✏️ **Link Editing:** Update expiry dates, toggle landing pages, change password protection, or replace files without changing the link ID.

### Admin & User Management

- 📊 **Admin Dashboard:** Statistics widget showing total links, active, expired, visits, and downloads with cache-based performance (5-minute TTL).
- 👔 **Admin User Management:** A dedicated interface for Admins to approve new registrations, revoke access, promote users, or manually create accounts.
- 📜 **Audit Logging:** Comprehensive, immutable database logs tracking every action (Creation, Deletion, Download, Login) with failed login tracking accessible via the Admin UI.
- 🚧 **User Ownership Scoping:** Enforced data isolation - users can only access their own files, admins have global visibility.
- 📉 **Scoped Usage Statistics:** Track performance with per-link and site-wide statistics. Users see metrics for their own files; Admins see global system health.

### Background Jobs & Automation

- 🐂 **BullMQ Integration:** Redis-backed job queues for batch operations with concurrency control (5 concurrent jobs).
- 🧠 **In-Memory Fallback:** Automatic fallback to in-memory job queue when Redis is unavailable.
- 🧹 **Automated Maintenance:** Cronjobs run in the background to proactively identify expired links and soft-deleted records, performing garbage collection on physical storage and database rows automatically.
- 🚿 **Cleanup Tasks:** Every 15 minutes - garbage collection of expired links, soft-deleted items past retention, and batch file deletion.
- 🔁 **Failed Deletion Retry:** Every 30 minutes - retries failed deletions up to 5 times with tracking.
- 🩺 **Storage Health Check:** Every 5 minutes - verifies storage provider connectivity, tests write permissions, and reports latency metrics.

### Rate Limiting & Abuse Prevention

- 🚦 **Global Rate Limiter:** 100 requests per 15-minute window for unauthenticated users (authenticated users exempt).
- 🚪 **Login Rate Limiter:** 5 failed attempts per 15-minute window to prevent brute force attacks.
- 🐌 **Download Rate Limiter:** 10 downloads per 5-minute window per IP to prevent bandwidth abuse.
- ⌨️ **Link Password Rate Limiter:** 5 failed password attempts per 15 minutes per link+IP combination.
- 🤳 **QR Code Rate Limiter:** 30 requests per 5-minute window to prevent DoS attacks on QR generation.

### Observability & Reliability

- 🆔 **Request Correlation IDs:** Logs include `x-correlation-id` to trace specific user actions across the entire request.
- 📝 **Hybrid Logging:** Beautiful, human-readable **emoji logs** for development and structured **JSON logs** (Pino) for production.
- 🏥 **Deep Health Checks:** Includes a `/health` endpoint that verifies Database connectivity, Storage connectivity, and Storage Write permissions.
- ⏱️ **Request Timeout:** Configurable 30-second timeout for requests with exclusions for file uploads.
- 👯 **Idempotency Support:** Optional `Idempotency-Key` header support with 24-hour response caching to prevent duplicate processing.
- ☝️ **Request Deduplication:** Fingerprint-based duplicate detection to prevent double-submissions within a 5-second window.
- 🔌 **Graceful Shutdown:** Signal handlers (SIGTERM/SIGINT) for clean shutdown of background jobs and connections.

### Architecture & DevOps

- 🗃️ **Database Agnostic:** Built to scale. Choose between zero-config **SQLite** for simplicity, or connect to **PostgreSQL** or **MySQL** databases.
- 🏛️ **Enterprise Architecture:** Built on a scalable Controller-Service-Repository pattern, utilizing the **Strategy Pattern** for interchangeable storage providers.
- 🐆 **Query Caching:** In-memory query result caching with tag-based invalidation and LRU eviction (1000 max entries).
- 🗝️ **Authenticated Encryption:** **AES-256-GCM** ensures download tokens are not only encrypted but also tamper-proof.
- 🔄 **Secret Key Rotation:** Support for multiple encryption keys allows you to rotate secrets without downtime or invalidating existing data.
- 👮♀️ **Strict Validation:** All environment variables and request inputs are strictly validated using **Zod**, ensuring stability and type safety.
- 🎭 **Trust Proxy:** Configurable support for running behind load balancers (Nginx/Cloudflare) for accurate rate limiting.
- 🚀 **Zero-Config Bootstrap:** Automatically seeds the initial Administrator account on the very first run using environment variables, removing the need for manual database setup.
- 🐳 **Docker Ready:** Includes a production-ready `Dockerfile` and a `docker-compose.yml` for easy local development and deployment.

### 📥 Installation

1.  **Clone the repository:** 👯
    ```bash
    git clone https://github.com/chrismccoy/tempdownloads.git
    cd tempdownloads
    ```

2.  **Install dependencies:** 📦
    ```bash
    npm install
    ```

3.  **Configure your environment:** ⚙️
    Copy the example file:
    ```bash
    cp .env.example .env
    ```
    **Critical Step:** You must configure the `.env` file. The application will fail to start if the keys are not the exact required length. See the **Environment Variables** section below for generator commands.

4.  **Run migrations:** 🗄️
    Initialize the database schema and build js and css
    ```bash
    npm run build:all
    ```

5.  **Start the server:** 🏁
    - **Development** (Auto-restart + Emoji Logs):
      ```bash
      npm run dev
      ```
    - **Production** (JSON Logs):
      ```bash
      npm start
      ```
    - *Note: On the first run, the system will check if the database is empty. If so, it will create the initial Admin account using the `ADMIN_INITIAL_...` credentials from your .env file.*

6.  **Access:** 🌐
    - **Landing:** [http://localhost:3000](http://localhost:3000)
    - **Login:** [http://localhost:3000/login](http://localhost:3000/login)

## 📜 Available Scripts

- ▶️ `npm run dev`: Starts the application in development mode using `nodemon` for auto-restarts and provides styled, human-readable logs.
- 🚀 `npm run start`: Starts the application in production mode.
- 🗄️ `npm run db:migrate`: Runs all pending database migrations to bring the schema up to date.
- ⏪ `npm run db:rollback`: Reverts the most recent database migration.
- 💅 `npm run build:css`: Compiles and minifies the Tailwind CSS for production.
- 👀 `npm run watch:css`: Starts a process to watch for changes in your CSS and automatically recompile.
- 🏗️ `npm run build:all`: Creates the Initial Databases and Compiles and minifies the Tailwind CSS for production.
- 🏃 `npm run build:run`: Creates the Initial Databases and Compiles and minifies the Tailwind CSS for production, and runs server.
- 🎨 `npm run format`: Automatically formats all project files (`.js`, `.ejs`, `.json`, etc.) using Prettier.
- 🕵️ `npm run format:check`: Check which files will be formatted when running through Prettier.
