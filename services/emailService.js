/**
 * Email Service
 *
 * Handles sending emails via different providers:
 * - console: Log emails to console (development)
 * - sendmail: Use local sendmail
 * - smtp: Use external SMTP server (Gmail, etc.)
 */

const nodemailer = require('nodemailer');
const config = require('../config');

class EmailService {
  /**
   * Creates EmailService with injected dependencies.
   */
  constructor(logger) {
    this.logger = logger;
    this.transporter = null;
    this.initialize();
  }

  /**
   * Initialize the email transporter based on provider configuration.
   */
  initialize() {
    const provider = config.email.provider;

    try {
      if (provider === 'console') {
        // Console provider - just log emails
        this.transporter = {
          sendMail: async (mailOptions) => {
            this.logger.info({
              to: mailOptions.to,
              subject: mailOptions.subject,
              from: mailOptions.from
            }, 'Email (console mode - not actually sent)');
            this.logger.info({ text: mailOptions.text }, 'Email text content');
            if (mailOptions.html) {
              this.logger.info('Email HTML content available (not logged)');
            }
            return { messageId: 'console-' + Date.now() };
          }
        };
        this.logger.info('Email service initialized: console mode');
      } else if (provider === 'sendmail') {
        // Sendmail provider - use local sendmail
        this.transporter = nodemailer.createTransport({
          sendmail: true,
          newline: 'unix',
          path: '/usr/sbin/sendmail'
        });
        this.logger.info('Email service initialized: sendmail');
      } else if (provider === 'smtp') {
        // SMTP provider - use external SMTP server
        if (!config.email.smtp.host) {
          throw new Error('EMAIL_SMTP_HOST is required when EMAIL_PROVIDER=smtp');
        }

        this.transporter = nodemailer.createTransport({
          host: config.email.smtp.host,
          port: config.email.smtp.port || 587,
          secure: config.email.smtp.secure, // true for 465, false for other ports
          auth: {
            user: config.email.smtp.auth.user,
            pass: config.email.smtp.auth.pass
          }
        });
        this.logger.info({ host: config.email.smtp.host }, 'Email service initialized: SMTP');
      } else {
        throw new Error(`Unknown email provider: ${provider}`);
      }
    } catch (error) {
      this.logger.error({ err: error }, 'Failed to initialize email service');
      // Fallback to console mode
      this.transporter = {
        sendMail: async (mailOptions) => {
          this.logger.warn('Email service failed to initialize, using console fallback');
          this.logger.info({
            to: mailOptions.to,
            subject: mailOptions.subject
          }, 'Email (fallback console mode)');
          return { messageId: 'fallback-' + Date.now() };
        }
      };
    }
  }

  /**
   * Send an email.
   */
  async sendEmail({ to, subject, text, html }) {
    const mailOptions = {
      from: `"${config.email.from.name}" <${config.email.from.address}>`,
      to,
      subject,
      text,
      html
    };

    try {
      const result = await this.transporter.sendMail(mailOptions);
      this.logger.info({
        to,
        subject,
        messageId: result.messageId
      }, 'Email sent successfully');
      return result;
    } catch (error) {
      this.logger.error({
        err: error,
        to,
        subject
      }, 'Failed to send email');
      throw error;
    }
  }

  /**
   * Send a password reset email.
   */
  async sendPasswordResetEmail(email, resetUrl, token) {
    const subject = 'Password Reset Request - Temp Downloads';

    const text = `
Hello,

We received a request to reset your password for your Temp Downloads account. If you didn't make this request, you can safely ignore this email.

To reset your password, visit this link (valid for 60 minutes):
${resetUrl}

If the link above doesn't work, copy and paste it into your browser.

If you did not request a password reset, please ignore this email. Your password will remain unchanged.

Security Tips:
• Never share your password with anyone
• Use a unique password for this account
• Enable two-factor authentication if available

---
This is an automated email from Temp Downloads. Please do not reply to this email.
© ${new Date().getFullYear()} Temp Downloads. All rights reserved.
    `.trim();

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Password Reset Request</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            background-color: #f5f5f5;
            margin: 0;
            padding: 20px;
        }
        .email-container {
            max-width: 600px;
            margin: 0 auto;
            background-color: #ffffff;
            border: 4px solid #000000;
            box-shadow: 8px 8px 0px #000000;
        }
        .email-header {
            background-color: #fef08a;
            border-bottom: 4px solid #000000;
            padding: 30px;
            text-align: center;
        }
        .email-header h1 {
            margin: 0;
            font-size: 28px;
            font-weight: bold;
            text-transform: uppercase;
            color: #000000;
        }
        .email-body {
            padding: 40px 30px;
        }
        .email-body p {
            margin: 0 0 20px 0;
            font-size: 16px;
        }
        .button-container {
            text-align: center;
            margin: 30px 0;
        }
        .reset-button {
            display: inline-block;
            padding: 15px 40px;
            background-color: #fef08a;
            color: #000000;
            text-decoration: none;
            font-weight: bold;
            text-transform: uppercase;
            border: 2px solid #000000;
        }
        .expiry-notice {
            background-color: #fef3c7;
            border: 2px solid #000000;
            padding: 15px;
            margin: 20px 0;
            font-size: 14px;
        }
        .alternative-link {
            margin-top: 30px;
            padding-top: 20px;
            border-top: 2px solid #e5e5e5;
            font-size: 14px;
            color: #666;
        }
        .alternative-link code {
            display: block;
            background-color: #f5f5f5;
            padding: 10px;
            border: 1px solid #ddd;
            word-wrap: break-word;
            font-size: 12px;
            margin-top: 10px;
        }
        .email-footer {
            background-color: #f5f5f5;
            border-top: 2px solid #000000;
            padding: 20px 30px;
            text-align: center;
            font-size: 12px;
            color: #666;
        }
    </style>
</head>
<body>
    <div class="email-container">
        <div class="email-header">
            <h1>Password Reset Request</h1>
        </div>

        <div class="email-body">
            <p>Hello,</p>

            <p>We received a request to reset your password for your Temp Downloads account. If you didn't make this request, you can safely ignore this email.</p>

            <div class="expiry-notice">
                <strong>⏱️ This link will expire in 60 minutes</strong> for your security.
            </div>

            <p>To reset your password, click the button below:</p>

            <div class="button-container">
                <a href="${resetUrl}" class="reset-button">Reset Password</a>
            </div>

            <div class="alternative-link">
                <p><strong>Button not working?</strong></p>
                <p>Copy and paste this link into your browser:</p>
                <code>${resetUrl}</code>
            </div>

            <p style="margin-top: 30px;">If you did not request a password reset, please ignore this email. Your password will remain unchanged.</p>

            <p style="margin-top: 20px;">
                <strong>Security Tips:</strong><br>
                • Never share your password with anyone<br>
                • Use a unique password for this account<br>
                • Enable two-factor authentication if available
            </p>
        </div>

        <div class="email-footer">
            <p>This is an automated email from Temp Downloads. Please do not reply to this email.</p>
            <p>&copy; ${new Date().getFullYear()} Temp Downloads. All rights reserved.</p>
        </div>
    </div>
</body>
</html>
    `.trim();

    return this.sendEmail({
      to: email,
      subject,
      text,
      html
    });
  }
}

module.exports = EmailService;
