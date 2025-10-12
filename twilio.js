const express = require('express');
const router = express.Router();

router.post('/twilio/voice', (req, res) => {
  const publicBase = process.env.PUBLIC_BASE_URL || '';
  const streamBase = publicBase.replace(/^http/, 'ws').replace(/\/$/, '');
  const streamUrl = `${streamBase}/media-stream?secret=${process.env.WS_SHARED_SECRET}`;

  const twiml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<Response>',
    `  <Connect><Stream url="${streamUrl}" /></Connect>`,
    '</Response>'
  ].join('');

  console.log("? Responding to /twilio/voice with TwiML");
  res.set('Content-Type', 'text/xml');
  res.status(200).send(twiml);
});

module.exports = router;
