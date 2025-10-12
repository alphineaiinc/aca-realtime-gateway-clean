// ==============================================
// src/brain/actions/order_confirm.js
// Story 3.4 — Order Confirmation & TTS Response
// ==============================================
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const { createLogger } = require("../utils/logger");
const logger = createLogger({ level: "info" });

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || "pNInz6obpgDQGcFmaJgB"; // example voice
const OUTPUT_DIR = path.join(__dirname, "../../public/tts");

// Ensure TTS directory exists
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

/**
 * Generate confirmation TTS for a given order summary
 */
async function generateOrderConfirmation(order) {
  const confirmationText = `Got it! Your order for ${order.items.join(" and ")} has been placed successfully.`;

  logger.info(`[TTS] Generating confirmation: "${confirmationText}"`);

  const outputFile = path.join(OUTPUT_DIR, `order_${order.id}.mp3`);
  const audioUrl = `/tts/order_${order.id}.mp3`;

  try {
    const response = await axios({
      method: "POST",
      url: `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
      headers: {
        "xi-api-key": ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
      },
      data: {
        text: confirmationText,
        model_id: "eleven_turbo_v2",
      },
      responseType: "arraybuffer",
    });

    fs.writeFileSync(outputFile, response.data);
    logger.info(`[TTS] Audio saved: ${outputFile}`);
    return { confirmationText, audioUrl };
  } catch (err) {
    logger.error(`[TTS Error] ${err.message}`);
    return { confirmationText, audioUrl: null };
  }
}

module.exports = { generateOrderConfirmation };
