/**
 * Alphine AI — Global Language Registry Builder (Final)
 * Works even if the installed OpenAI SDK lacks .audio.voices.list()
 */
import 'dotenv/config';
import fs from "fs";
import path from "path";
import https from "https";
import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const OUT = path.resolve("./config/languageRegistry.json");

// --- 22 Official Indian Languages ---
const indian = {
  "as-IN": "Assamese (India)",
  "bn-IN": "Bengali (India)",
  "brx-IN": "Bodo (India)",
  "doi-IN": "Dogri (India)",
  "gu-IN": "Gujarati (India)",
  "hi-IN": "Hindi (India)",
  "kn-IN": "Kannada (India)",
  "ks-IN": "Kashmiri (India)",
  "kok-IN": "Konkani (India)",
  "mai-IN": "Maithili (India)",
  "ml-IN": "Malayalam (India)",
  "mni-IN": "Manipuri (India)",
  "mr-IN": "Marathi (India)",
  "ne-IN": "Nepali (India)",
  "or-IN": "Odia (India)",
  "pa-IN": "Punjabi (India)",
  "sa-IN": "Sanskrit (India)",
  "sat-IN": "Santali (India)",
  "sd-IN": "Sindhi (India)",
  "ta-IN": "Tamil (India)",
  "te-IN": "Telugu (India)",
  "ur-IN": "Urdu (India)"
};

async function fetchVoicesDirectly() {
  return new Promise((resolve) => {
    const req = https.get(
      "https://api.openai.com/v1/audio/voices",
      { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` } },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            const json = JSON.parse(data);
            resolve(json.data || []);
          } catch {
            resolve([]);
          }
        });
      }
    );
    req.on("error", () => resolve([]));
  });
}

async function buildRegistry() {
  const registry = { ...indian };
  let voices = [];

  try {
    // Try SDK voice list if available
    if (client.audio?.voices?.list) {
      const r = await client.audio.voices.list();
      voices = r.data || [];
    } else {
      // fallback: direct REST call
      voices = await fetchVoicesDirectly();
    }
  } catch (e) {
    console.warn("⚠️ Could not fetch voice metadata:", e.message);
  }

  voices.forEach((v) => {
    if (v.language && !registry[v.language]) {
      registry[v.language] = v.display_name || v.language;
    }
  });

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({ languages: registry }, null, 2));
  console.log("✅ languageRegistry.json built with", Object.keys(registry).length, "languages");
}

buildRegistry();
