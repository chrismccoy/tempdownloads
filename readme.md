# 📦 TempDownloads ⏱️

Temp Downloads is a secure, self-hosted, multi-user platform for sharing time-sensitive files. It provides an admin dashboard where users can upload assets and generate unique, encrypted download links that automatically expire. Perfect for teams sharing digital assets, client deliverables, or sensitive documents with full control.

### ✨ Features

*   **🗄️ Database Agnostic:**Built to scale. Choose between zero-config **SQLite** for simplicity, or connect to enterprise-grade **PostgreSQL** or **MySQL** databases for high-availability deployments.
*   **👥 Multi-User Architecture:** Full authentication system supporting user registration, secure login, and administrator approval workflows.
*   **👮 Role-Based Access Control:** Granular permissions ensure regular users only see and manage their own files, while Super Admins have global oversight and user management tools.
*   **🛡️ Secure, Expiring Links:** Create time-sensitive, tamper-proof, encrypted links that automatically expire after a configured period.
*   **🔥 Burn-on-Read:** Optional "Self-Destruct" mode. Links and files are permanently deleted immediately after the first successful download.
*   **🔑 Password Protection:** Add an extra layer of security by requiring a password to unlock specific download links.
*   **🔐 Encryption at Rest:** Local uploads are encrypted on-the-fly using **AES-256-GCM** before hitting the disk, ensuring physical theft protection.
*   **📜 Audit Logging:** Comprehensive, immutable database logs tracking every action (Creation, Deletion, Download, Login) accessible via the Admin UI.
*   **📱 QR Code Generation:** Instantly generate QR codes for landing pages to easily transfer files to mobile devices.
*   **🔍 File Integrity Checksums:** Calculates **SHA-256** checksums during upload to verify file integrity and prevent corruption.
*   **🌊 Stream Processing:** Optimized upload pipeline using Node.js Streams to handle large files with minimal memory footprint.
*   **🔗 Clean, Shareable URLs:** Landing pages use clean, human-readable URLs (e.g., `/download/a8c2efb1`) perfect for sharing, while the actual download is protected by a separate, secure token.
*   **⚡ Hybrid Storage Engine:** Smart uploads that streams local files efficiently or utilizes Presigned URLs/SAS Tokens for direct-to-cloud uploads (S3/Azure) to bypass server bottlenecks.
*   **🧙♂️ Magic Byte Validation:** Security goes beyond file extensions. The system inspects the binary signature (Magic Bytes) of every upload to prevent spoofing and ensure file integrity.
*   **🧱 Brutalist UI:** A sharp, functional interface built with Tailwind CSS.
*   **⚡ Alpine.js Interactive UI:** Uses lightweight Alpine.js for a reactive, progressively enhanced user experience (handling uploads, progress bars, and UI state).
*   **👨💼 Admin User Management:** A dedicated interface for Admins to approve new registrations, revoke access, promote users, or manually create accounts.
*   **🗓️ Custom Expiration:** Set a link to expire in minutes, hours, days, years, or choose a specific custom date and time. Links can also be set to never expire.
*   **🔄 Secret Key Rotation:** Support for multiple encryption keys allows you to rotate secrets without downtime or invalidating existing data.
*   **📄 Expanded File Type Support:** Natively supports `.zip`, `.7z`, `.pdf`, `.jpg`, `.png`, and `.gif` files.
*   **📊 Scoped Usage Statistics:** Track performance with per-link and site-wide statistics. Users see metrics for their own files; Admins see global system health.
*   **🎨 Flexible Download Experience:** Choose between a direct file download or a professional landing page for each link, displaying file name, size, and expiration.
*   **✅ Strict Validation:** All environment variables and request inputs are strictly validated using **Zod**, ensuring stability and type safety.
*   **🔒 Security Hardened:**
    *   **Double-Submit CSRF:** Modern CSRF protection for all state-changing actions.
    *   **Strict CSP & Reporting:** Hardened Helmet configuration with strict Content Security Policy directives and a built-in violation reporting endpoint.
    *   **Trust Proxy:** Configurable support for running behind load balancers (Nginx/Cloudflare) for accurate rate limiting.
*   **🕵️ Observability & Tracing:** Logs include **Request Correlation IDs** (`x-correlation-id`) to trace specific user actions across the entire request lifecycle.
*   **📝 Hybrid & File Logging:** Beautiful, human-readable **emoji logs** for development and structured **JSON logs** (Pino) for production.
*   **🩺 Deep Health Checks:** Includes a `/health` endpoint that verifies Database connectivity, Storage connectivity, and Storage Write permissions.
*   **🏗️ Enterprise Architecture:** Built on a scalable Controller-Service-Repository pattern, utilizing the **Strategy Pattern** for interchangeable storage providers.
*   **☁️ Multi-Cloud Storage:** Native support for **AWS S3**, **Cloudflare R2**, **Azure Blob Storage**, and local disk storage, configurable via a simple switch.
*   **🔐 Authenticated Encryption:** **AES-256-GCM** to ensure download tokens are not only encrypted but also tamper-proof.
*   **🗑️ Trash & Recovery:** Deleted links are moved to a dedicated "Trash Can" UI instead of being lost immediately. Admins can restore files deleted by mistake or force a permanent deletion manually.
*   **🤖 Automated Maintenance:** **Cronjobs** run in the background to proactively identify expired links and soft-deleted records, performing garbage collection on physical storage and database rows automatically.
*   **🌱 Zero-Config Bootstrap:** Automatically seeds the initial Administrator account on the very first run using environment variables, removing the need for manual database setup.
*   **🐳 Docker Ready:** Includes a production-ready `Dockerfile` and a `docker-compose.yml` for easy local development and deployment.
