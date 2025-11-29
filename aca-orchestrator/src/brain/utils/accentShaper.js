// src/brain/utils/accentShaper.js
// ----------------------------------------------------
// Story 9.X — Regional Accent & Phrasing Shaper
// Lightly adjusts phrasing to feel more local / natural.
// NOTE: Intentionally conservative to avoid changing meaning.
// ----------------------------------------------------

/**
 * applyAccentShaping
 *
 * @param {string} text
 * @param {object} options
 *  - langCode   (e.g. "en-US", "ta-IN")
 *  - regionCode (e.g. "IN", "FR", "CA")
 * @returns {string}
 */
function applyAccentShaping(
  text,
  { langCode = "en-US", regionCode = null } = {}
) {
  if (!text || typeof text !== "string") return text;
  let out = text;

  const baseLang = (langCode || "en-US").split("-")[0];
  const region = (regionCode || "").toUpperCase();

  // --------------------------------
  // English (India) – softer phrasing
  // --------------------------------
  if (baseLang === "en" && region === "IN") {
    out = out.replace(/\bplease wait\b/gi, "please hold on for a moment");
    out = out.replace(/\bthank you\b/gi, "thank you so much");
  }

  // --------------------------------
  // Tamil (India) – slight Tanglish flavor
  // --------------------------------
  if (baseLang === "ta") {
    // A very subtle change; we can expand later as we test.
    out = out.replace(/\bThank you\b/gi, "Thank you, sir");
  }

  // --------------------------------
  // French – soften sharp exclamation
  // --------------------------------
  if (baseLang === "fr") {
    out = out.replace(/!/g, ".");
  }

  // More regional patterns can be added over time after QA.

  return out;
}

module.exports = { applyAccentShaping };
