// src/voice/slotEnforcement.js

const { getBusinessSlotProfile } = require("./businessSlotProfiles");

function isMeaningful(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string" && !value.trim()) return false;
  if (Array.isArray(value) && value.length === 0) return false;
  return true;
}

function normalizePhoneDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function isPhoneComplete(value) {
  const digits = normalizePhoneDigits(value);
  return digits.length >= 10;
}

function getSlotValue(slots, key) {
  return slots?.[key];
}

function isSlotFilled(slotName, slots) {
  const value = getSlotValue(slots, slotName);

  if (slotName === "phone") {
    return isPhoneComplete(value);
  }

  return isMeaningful(value);
}

function getMissingRequiredSlots(businessType, slots) {
  const profile = getBusinessSlotProfile(businessType);
  return profile.required.filter((slotName) => !isSlotFilled(slotName, slots || {}));
}

function getNextMissingRequiredSlot(businessType, slots) {
  const missing = getMissingRequiredSlots(businessType, slots);
  return missing.length ? missing[0] : null;
}

function canConfirmNow(businessType, slots) {
  return getMissingRequiredSlots(businessType, slots).length === 0;
}

function getNextSlotQuestion(businessType, slotName) {
  const profile = getBusinessSlotProfile(businessType);
  return profile.slotQuestions?.[slotName] || "Could you share that detail with me?";
}

function mergeExtractedSlots(existingSlots = {}, extractedSlots = {}) {
  const merged = { ...existingSlots };

  for (const [key, value] of Object.entries(extractedSlots || {})) {
    if (!isMeaningful(value)) continue;

    if (key === "phone") {
      const existingDigits = normalizePhoneDigits(merged.phone);
      const incomingDigits = normalizePhoneDigits(value);
      merged.phone = incomingDigits || existingDigits || merged.phone;
      continue;
    }

    merged[key] = value;
  }

  return merged;
}

module.exports = {
  normalizePhoneDigits,
  isPhoneComplete,
  isSlotFilled,
  getMissingRequiredSlots,
  getNextMissingRequiredSlot,
  canConfirmNow,
  getNextSlotQuestion,
  mergeExtractedSlots,
};