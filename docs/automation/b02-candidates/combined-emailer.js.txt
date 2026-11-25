/**
 * src/brain/utils/emailer.js
 * Story 11.9 — SMTP Email Delivery Layer
 */

const nodemailer = require("nodemailer");
const fs = require("fs");
const path = require("path");

const logPath = path.join(__dirname, "../../logs/billing_notifications.log");
if (!fs.existsSync(path.dirname(logPath))) {
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
}

let transporter;

try {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 465),
    secure: true,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    },
    tls: {
      rejectUnauthorized: true
    }
  });
} catch (err) {
  fs.appendFileSync(
    logPath,
    `[${new Date().toISOString()}] EMAIL TRANSPORT INIT FAILED: transport initialization failed\n`
  );
}

async function sendBillingEmail(to, subject, html, text, { singleAttempt = false } = {}) {
  const mailOptions = {
    from: process.env.SMTP_FROM || "Alphine AI Billing <no-reply@alphineai.com>",
    to,
    subject,
    text: text || "",
    html
  };

  const attempts = singleAttempt ? 1 : 3;
  for (let i = 1; i <= attempts; i++) {
    try {
      const result = await transporter.sendMail(mailOptions);
      fs.appendFileSync(
        logPath,
        `[${new Date().toISOString()}] Email accepted\n`
      );
      return result;
    } catch (err) {
      fs.appendFileSync(
        logPath,
        `[${new Date().toISOString()}] Email attempt ${i} failed\n`
      );
      if (i === attempts) throw err;
    }
  }
}

module.exports = { sendBillingEmail };
