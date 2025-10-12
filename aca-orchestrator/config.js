// config.js
require("dotenv").config({ path: __dirname + "/../.env" });

module.exports = {
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY,
  GOOGLE_PROJECT_ID: process.env.GOOGLE_PROJECT_ID,
  PUBLIC_URL: process.env.PUBLIC_URL,
  NGROK_HOST: process.env.NGROK_HOST,
  APP_ENV: process.env.APP_ENV || "development",
};
