// src/brain/utils/prosodyEngine.js
// ----------------------------------------------------
// Story 9.X — Prosody Engine
// Makes speech more human-like: pacing, pauses, emphasis.
// ----------------------------------------------------

/**
 * applyProsody
 *
 * @param {string} text
 * @param {object} options
 *  - langCode   (e.g. "en-US", "ta-IN")
 *  - tonePreset (e.g. "friendly", "formal", "supportive")
 * @returns {string}
 */
function applyProsody(
  text,
  { langCode = "en-US", tonePreset = "friendly" } = {}
) {
  if (!text || typeof text !== "string") return text;

  let out = text.trim();

  // 1) Normalize spaces
  out = out.replace(/\s+/g, " ");

  // 2) Break overly long sentence runs with soft pauses.
  //    Example: "Hello. How are you?" -> "Hello. ... How are you?"
  out = out.replace(/([.!?])\s+(?=[A-Z0-9])/g, "$1 ... ");

  // 3) Add gentle emphasis and pacing for common politeness phrases.
  const softPhrases = ["please", "thank you", "one moment", "just a second"];
  softPhrases.forEach((phrase) => {
    const re = new RegExp(`\\b${phrase}\\b`, "gi");
    out = out.replace(re, (m) => `, ${m},`);
  });

  // 4) Tone-specific adjustments (basic but safe).
  if (tonePreset === "supportive") {
    // Slightly slower feel with extra soft ellipses.
    out = out.replace(/([,.!?])\s*/g, "$1... ");
  } else if (tonePreset === "formal") {
    // Remove repeated ellipses to sound more crisp.
    out = out.replace(/\.{3,}/g, ". ");
  }

  return out;
}

module.exports = { applyProsody };
