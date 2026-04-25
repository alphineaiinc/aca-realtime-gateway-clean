// src/voice/businessSlotProfiles.js


const BUSINESS_SLOT_PROFILES = {
  restaurant: {
    required: ["intent", "party_size", "date", "time", "name", "phone"],
    optional: ["occasion", "seating_preference", "special_requests"],
    slotQuestions: {
      intent: "How can I help with your reservation today?",
      party_size: "For how many guests should I note the reservation?",
      date: "Which date would you like to book for?",
      time: "What time would you like the table?",
      name: "May I have your name for the booking?",
      phone: "What phone number should we use for the reservation?"
    }
  },

  medical: {
   medical: {
  required: ["appointment_type", "date", "time", "name", "phone"],
    optional: ["symptoms", "doctor_preference", "patient_status", "urgency"],
    slotQuestions: {
      intent: "How can I help with your appointment today?",
      appointment_type: "What type of appointment would you like to book?",
      date: "Which date would you like to come in?",
      time: "What time works best for you?",
      name: "May I have your full name?",
      phone: "What phone number should we use to reach you?"
    }
  },

  salon: {
    required: ["intent", "service", "date", "time", "name", "phone"],
    optional: ["staff_preference", "first_time_client", "notes"],
    slotQuestions: {
      intent: "How can I help with your booking today?",
      service: "What service would you like to book?",
      date: "Which date would you prefer?",
      time: "What time works best for you?",
      name: "May I have your name for the booking?",
      phone: "What phone number should we use for the booking?"
    }
  },

  auto_service: {
    required: ["intent", "service", "vehicle_make", "vehicle_model", "date", "time", "name", "phone"],
    optional: ["vehicle_year", "issue_description", "urgency", "dropoff_type"],
    slotQuestions: {
      intent: "How can I help with your vehicle service today?",
      service: "What service do you need for the vehicle?",
      vehicle_make: "What is the make of the vehicle?",
      vehicle_model: "What is the model of the vehicle?",
      date: "Which date would you prefer?",
      time: "What time works best for you?",
      name: "May I have your name?",
      phone: "What phone number should we use to reach you?"
    }
  },

  home_services: {
    required: ["intent", "service", "address", "date", "time_window", "name", "phone"],
    optional: ["issue_description", "urgency", "property_type", "access_notes"],
    slotQuestions: {
      intent: "How can I help with your service request today?",
      service: "What service do you need?",
      address: "What address should we use for the visit?",
      date: "Which date would you prefer?",
      time_window: "What time window works best for you?",
      name: "May I have your name?",
      phone: "What phone number should we use to reach you?"
    }
  },

  legal_finance_consulting: {
    required: ["intent", "consultation_type", "date", "time", "name", "phone"],
    optional: ["matter_summary", "urgency", "meeting_mode", "email"],
    slotQuestions: {
      intent: "How can I help with your consultation today?",
      consultation_type: "What type of consultation would you like to arrange?",
      date: "Which date works best for you?",
      time: "What time works best for you?",
      name: "May I have your name?",
      phone: "What phone number should we use to reach you?"
    }
  },

  pet_services: {
    required: ["intent", "service", "pet_type", "pet_name", "date", "time", "name", "phone"],
    optional: ["breed", "size", "special_instructions"],
    slotQuestions: {
      intent: "How can I help with your pet service today?",
      service: "What service would you like to book?",
      pet_type: "What type of pet is it?",
      pet_name: "What is your pet's name?",
      date: "Which date would you prefer?",
      time: "What time works best for you?",
      name: "May I have your name?",
      phone: "What phone number should we use to reach you?"
    }
  },

  real_estate_property: {
    required: ["intent", "request_type", "property_reference", "date", "time", "name", "phone"],
    optional: ["budget_range", "location_preference", "notes", "email"],
    slotQuestions: {
      intent: "How can I help with your property request today?",
      request_type: "What kind of property request is this?",
      property_reference: "Which property would you like me to note?",
      date: "Which date works best for you?",
      time: "What time works best for you?",
      name: "May I have your name?",
      phone: "What phone number should we use to reach you?"
    }
  },

  education_tutoring_training: {
    required: ["intent", "service", "subject_or_course", "date", "time", "name", "phone"],
    optional: ["grade_level", "delivery_mode", "notes", "email"],
    slotQuestions: {
      intent: "How can I help with your booking today?",
      service: "What type of session would you like to arrange?",
      subject_or_course: "Which subject or course should I note?",
      date: "Which date works best for you?",
      time: "What time works best for you?",
      name: "May I have your name?",
      phone: "What phone number should we use to reach you?"
    }
  },

  fitness_wellness: {
    required: ["intent", "service", "date", "time", "name", "phone"],
    optional: ["trainer_preference", "session_type", "experience_level"],
    slotQuestions: {
      intent: "How can I help with your booking today?",
      service: "What service would you like to book?",
      date: "Which date works best for you?",
      time: "What time works best for you?",
      name: "May I have your name?",
      phone: "What phone number should we use to reach you?"
    }
  },

  retail_callback_and_general_service: {
    required: ["intent", "reason", "name", "phone"],
    optional: ["product_interest", "date", "time", "notes"],
    slotQuestions: {
      intent: "How can I help you today?",
      reason: "What can I help you with?",
      name: "May I have your name?",
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

  if ([
    "restaurant",
    "hotel_restaurant",
    "dining",
    "food",
    "cafe",
    "restaurant_hospitality"
  ].includes(value)) {
    return "restaurant";
  }

  if ([
    "medical",
    "clinic",
    "doctor",
    "hospital",
    "dentist",
    "healthcare",
    "medical_clinic",
    "dental_vision"
  ].includes(value)) {
    return "medical";
  }

  if ([
    "salon",
    "spa",
    "beauty",
    "barber",
    "beauty_salon_spa"
  ].includes(value)) {
    return "salon";
  }

  if ([
    "auto",
    "auto_service",
    "car_service",
    "repair_shop",
    "mechanic"
  ].includes(value)) {
    return "auto_service";
  }

  if ([
    "home_services",
    "plumbing",
    "electrician",
    "hvac",
    "cleaning",
    "appliance_repair",
    "handyman"
  ].includes(value)) {
    return "home_services";
  }

  if ([
    "legal",
    "finance",
    "consulting",
    "lawyer",
    "accounting",
    "legal_finance_consulting"
  ].includes(value)) {
    return "legal_finance_consulting";
  }

  if ([
    "pet",
    "pet_services",
    "grooming",
    "vet"
  ].includes(value)) {
    return "pet_services";
  }

  if ([
    "real_estate",
    "property",
    "real_estate_property"
  ].includes(value)) {
    return "real_estate_property";
  }

  if ([
    "education",
    "tutoring",
    "training",
    "education_tutoring_training"
  ].includes(value)) {
    return "education_tutoring_training";
  }

  if ([
    "fitness",
    "wellness",
    "gym",
    "fitness_wellness"
  ].includes(value)) {
    return "fitness_wellness";
  }

  if ([
    "retail",
    "store",
    "shop",
    "retail_callback_and_general_service"
  ].includes(value)) {
    return "retail_callback_and_general_service";
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