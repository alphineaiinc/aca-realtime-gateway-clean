// src/voice/businessSlotProfiles.js

const BUSINESS_SLOT_PROFILES = {
  restaurant: {
    required: ["intent", "party_size", "date", "time", "name", "phone"],
    optional: ["special_requests"],
    slotQuestions: {
      intent: "How can I help with your reservation today?",
      party_size: "For how many people should I book the table?",
      date: "Which date would you like to book for?",
      time: "What time would you like the table?",
      name: "May I have your name for the booking?",
      phone: "What phone number should we use for the reservation?"
    }
  },

  medical: {
    required: ["intent", "service", "date", "time", "name", "phone"],
    optional: ["symptoms", "insurance", "doctor_preference"],
    slotQuestions: {
      intent: "How can I help with your appointment today?",
      service: "What kind of appointment or service do you need?",
      date: "Which date would you like to come in?",
      time: "What time works best for you?",
      name: "May I have your full name?",
      phone: "What phone number should we use to reach you?"
    }
  },

  generic: {
    required: ["intent", "date", "time", "name", "phone"],
    optional: ["service", "notes"],
    slotQuestions: {
      intent: "How can I help you today?",
      date: "Which date would you like this for?",
      time: "What time works best for you?",
      name: "May I have your name?",
      phone: "What phone number should we use to contact you?"
    }
  }
};

function normalizeBusinessType(input) {
  const value = String(input || "").trim().toLowerCase();

  if (!value) return "generic";
  if (["restaurant", "hotel_restaurant", "dining", "food", "cafe"].includes(value)) {
    return "restaurant";
  }
  if (["medical", "clinic", "doctor", "hospital", "dentist", "healthcare"].includes(value)) {
    return "medical";
  }
  return "generic";
}

function getBusinessSlotProfile(businessType) {
  const normalized = normalizeBusinessType(businessType);
  return BUSINESS_SLOT_PROFILES[normalized] || BUSINESS_SLOT_PROFILES.generic;
}

module.exports = {
  BUSINESS_SLOT_PROFILES,
  normalizeBusinessType,
  getBusinessSlotProfile,
};