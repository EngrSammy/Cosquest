const nodemailer = require('nodemailer');

const REQUIRED_ENV = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASSWORD', 'SMTP_FROM_EMAIL'];

let transporter = null;
// Test-mode only: every "sent" email lands here instead of a real inbox, so
// the smoke suite can read the reset code straight out of it instead of
// needing a real mailbox. Never populated outside NODE_ENV=test.
const testSentEmails = [];

function getTransporter() {
  if (transporter) return transporter;
  const missing = REQUIRED_ENV.filter((name) => !process.env[name]);
  if (missing.length) {
    const error = new Error(`Email is not configured. Missing: ${missing.join(', ')}`);
    error.status = 503;
    throw error;
  }
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
  });
  return transporter;
}

/**
 * Sends real mail through the SMTP account configured in .env (Hostinger or
 * otherwise). Never touches a real mail server in tests - same pattern as
 * imageHost.js's Cloudinary calls and transcribeAudio.js's Deepgram call.
 */
async function sendEmail({ to, subject, text, html }) {
  if (process.env.NODE_ENV === 'test') {
    testSentEmails.push({ to, subject, text, html });
    return { skipped: true };
  }
  const from = process.env.SMTP_FROM_NAME ? `"${process.env.SMTP_FROM_NAME}" <${process.env.SMTP_FROM_EMAIL}>` : process.env.SMTP_FROM_EMAIL;
  return getTransporter().sendMail({ from, to, subject, text, html });
}

module.exports = { sendEmail, testSentEmails };
