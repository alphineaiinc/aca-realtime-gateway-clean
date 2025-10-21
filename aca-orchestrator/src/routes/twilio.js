// src/routes/twilio.js
const express = require("express");
const router = express.Router();

/**
 * Voice webhook handler — called when a call starts.
 */
router.post("/voice", (req, res) => {
  console.log("🛰️  Incoming Twilio Voice webhook:", req.body);
  // Respond with TwiML to say a greeting or connect to ACA logic
  res.type("text/xml");
  res.send(`
    <Response>
      <Say voice="Polly.Amy-Neural">Welcome to Alphine AI. The call orchestration service is active.</Say>
      <Pause length="1"/>
      <Hangup/>
    </Response>
  `);
});

/**
 * Status callback handler — called when Twilio reports call progress.
 */
router.post("/status", (req, res) => {
  console.log("📡  Twilio Status update:", req.body.CallStatus);
  res.sendStatus(200);
});

module.exports = router;
