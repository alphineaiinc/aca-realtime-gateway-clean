require('dotenv').config();
const express = require('express');
const twilio = require('twilio');

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// Validate Twilio signature
const twilioWebhook = twilio.webhook({
  validate: process.env.APP_ENV === 'production'
});

app.post('/twilio/voice', twilioWebhook, (req, res) => {
  const wsHost = req.headers['host'];
  const secret = process.env.WS_SHARED_SECRET;

  const twiml = new twilio.twiml.VoiceResponse();
  twiml.connect().stream({
    url: `wss://${wsHost}/media-stream?secret=${secret}`,
  });

  res.type('text/xml').send(twiml.toString());
});

module.exports = app;
