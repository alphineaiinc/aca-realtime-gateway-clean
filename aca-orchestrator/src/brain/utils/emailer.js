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
      rejectUnauthorized: false
    }
  });
} catch (err) {
  fs.appendFileSync(
    logPath,
    `[${new Date().toISOString()}] EMAIL TRANSPORT INIT FAILED: ${err.message}\n`
  );
}

async function sendBillingEmail(to, subject, html, text) {
  const mailOptions = {
    from: process.env.SMTP_FROM || "Alphine AI Billing <no-reply@alphineai.com>",
    to,
    subject,
    text: text || "",
    html
  };

  for (let i = 1; i <= 3; i++) {
    try {
      const result = await transporter.sendMail(mailOptions);
      fs.appendFileSync(
        logPath,
        `[${new Date().toISOString()}] Email sent → ${to}, subject: ${subject}\n`
      );
      return result;
    } catch (err) {
      fs.appendFileSync(
        logPath,
        `[${new Date().toISOString()}] Email attempt ${i} FAILED: ${err.message}\n`
      );
      if (i === 3) throw err;
    }
  }
}

module.exports = { sendBillingEmail };
