const { execSync } = require("child_process");
const fs = require("fs");
const axios = require("axios");
require("dotenv").config();

// Step 1: Start ngrok and get new HTTPS URL
console.log("🚀 Starting ngrok...");
execSync("pkill ngrok || true");
const ngrok = execSync("ngrok http 8080 --log=stdout").toString();
const match = ngrok.match(/https:\/\/[a-z0-9\-]+\.ngrok-free\.app/);
if (!match) throw new Error("❌ Could not extract ngrok URL");
const newHost = match[0].replace("https://", "");
console.log("🌐 New ngrok host:", newHost);

// Step 2: Update .env
console.log("📝 Updating .env...");
const env = fs.readFileSync(".env", "utf8");
const updatedEnv = env.replace(/NGROK_HOST=.*/g, `NGROK_HOST=${newHost}`);
fs.writeFileSync(".env", updatedEnv);

// Step 3: Restart Node server
console.log("🔁 Restarting Node server...");
execSync("pkill node || true");
execSync("npm run start");

// Step 4: Update Twilio webhook
console.log("📡 Updating Twilio webhook...");
const { TWILIO_PHONE_NUMBER, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN } = process.env;
const webhookUrl = `https://${newHost}/twilio/voice`;

axios.post(
  `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/IncomingPhoneNumbers.json`,
  new URLSearchParams({
    PhoneNumber: TWILIO_PHONE_NUMBER,
    VoiceUrl: webhookUrl,
    VoiceMethod: "POST",
  }),
  {
    auth: {
      username: TWILIO_ACCOUNT_SID,
      password: TWILIO_AUTH_TOKEN,
    },
  }
).then(() => {
  console.log("✅ Twilio webhook updated:", webhookUrl);
}).catch((err) => {
  console.error("❌ Failed to update Twilio:", err.response?.data || err.message);
});