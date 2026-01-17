// src/brain/utils/fillers.js
// ----------------------------------------------------
// Story 9.X — Conversational Filler Generator
// Adds natural fillers like "Just a moment..." in a safe way.
// ----------------------------------------------------

/**
 * Returns a short filler phrase appropriate for the language.
 */
function getFiller(langCode = "en-US", tonePreset = "friendly") {
  const baseLang = (langCode || "en-US").split("-")[0];

  switch (baseLang) {
    case "ta": // Tamil
      return "ஒரு நிமிஷம், "; // "One moment,"
    case "hi": // Hindi
      return "एक मिनट, ज़रूर, "; // "One minute, sure,"
    case "fr": // French
      return "Un instant, s'il vous plaît, ";
    case "es": // Spanish
      return "Un momento, por favor, ";
    case "ar": // Arabic (basic)
      return "لحظة واحدة، من فضلك، ";
    default: {
      // English & others
      if (tonePreset === "formal") {
        return "One moment, please, ";
      }
      return "Just a moment, let me check, ";
    }
  }
}

/**
 * injectFillers
 *
 * @param {string} text
 * @param {object} options
 *  - langCode
 *  - tonePreset
 * @returns {string}
 */
function injectFillers(
  text,
  { langCode = "en-US", tonePreset = "friendly" } = {}
) {
  if (!text || typeof text !== "string") return text;

  const trimmed = text.trim();
  if (!trimmed) return text;

  // If text already starts with a filler-like phrase, do nothing.
  const startsWithFillerPattern =
    /^(just a moment|one moment|un instant|un momento|ஒரு நிமிஷம்|एक मिनट)/i;
  if (startsWithFillerPattern.test(trimmed)) return text;

  const filler = getFiller(langCode, tonePreset);

  // Prepend filler to the first sentence only.
  return `${filler}${trimmed}`;
}

module.exports = { injectFillers, getFiller };
