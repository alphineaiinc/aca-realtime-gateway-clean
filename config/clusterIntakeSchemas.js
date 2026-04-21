// config/clusterIntakeSchemas.js

module.exports = {
  restaurant_hospitality: {
    required: ["date", "time", "party_size", "name", "phone"],
    optional: ["occasion", "seating_preference", "special_requests"],
    confirmationFields: ["date", "time", "party_size"],
    notificationFields: [
      "name", "phone", "date", "time", "party_size",
      "occasion", "seating_preference", "special_requests"
    ]
  },

  medical_clinic: {
    required: ["appointment_type", "date", "time", "name", "phone"],
    optional: ["symptoms", "doctor_preference", "patient_status", "urgency"],
    confirmationFields: ["appointment_type", "date", "time"],
    notificationFields: [
      "name", "phone", "appointment_type", "date", "time",
      "symptoms", "doctor_preference", "patient_status", "urgency"
    ]
  },

  dental_vision: {
    required: ["appointment_type", "date", "time", "name", "phone"],
    optional: ["symptoms", "provider_preference", "patient_status", "urgency"],
    confirmationFields: ["appointment_type", "date", "time"],
    notificationFields: [
      "name", "phone", "appointment_type", "date", "time",
      "symptoms", "provider_preference", "patient_status", "urgency"
    ]
  },

  beauty_salon_spa: {
    required: ["service", "date", "time", "name", "phone"],
    optional: ["staff_preference", "first_time_client", "notes"],
    confirmationFields: ["service", "date", "time"],
    notificationFields: [
      "name", "phone", "service", "date", "time",
      "staff_preference", "first_time_client", "notes"
    ]
  },

  fitness_wellness: {
    required: ["service", "date", "time", "name", "phone"],
    optional: ["trainer_preference", "session_type", "experience_level"],
    confirmationFields: ["service", "date", "time"],
    notificationFields: [
      "name", "phone", "service", "date", "time",
      "trainer_preference", "session_type", "experience_level"
    ]
  },

  auto_service: {
    required: ["service", "vehicle_make", "vehicle_model", "date", "time", "name", "phone"],
    optional: ["vehicle_year", "issue_description", "urgency", "dropoff_type"],
    confirmationFields: ["service", "vehicle_make", "vehicle_model", "date", "time"],
    notificationFields: [
      "name", "phone", "service", "vehicle_make", "vehicle_model",
      "vehicle_year", "issue_description", "urgency", "dropoff_type",
      "date", "time"
    ]
  },

  home_services: {
    required: ["service", "address", "date", "time_window", "name", "phone"],
    optional: ["issue_description", "urgency", "property_type", "access_notes"],
    confirmationFields: ["service", "date", "time_window"],
    notificationFields: [
      "name", "phone", "service", "address", "date", "time_window",
      "issue_description", "urgency", "property_type", "access_notes"
    ]
  },

  legal_finance_consulting: {
    required: ["consultation_type", "date", "time", "name", "phone"],
    optional: ["matter_summary", "urgency", "meeting_mode", "email"],
    confirmationFields: ["consultation_type", "date", "time"],
    notificationFields: [
      "name", "phone", "email", "consultation_type", "date", "time",
      "matter_summary", "urgency", "meeting_mode"
    ]
  },

  pet_services: {
    required: ["service", "pet_type", "pet_name", "date", "time", "name", "phone"],
    optional: ["breed", "size", "special_instructions"],
    confirmationFields: ["service", "pet_name", "date", "time"],
    notificationFields: [
      "name", "phone", "service", "pet_type", "pet_name",
      "breed", "size", "special_instructions", "date", "time"
    ]
  },

  real_estate_property: {
    required: ["request_type", "property_reference", "date", "time", "name", "phone"],
    optional: ["budget_range", "location_preference", "notes", "email"],
    confirmationFields: ["request_type", "property_reference", "date", "time"],
    notificationFields: [
      "name", "phone", "email", "request_type", "property_reference",
      "budget_range", "location_preference", "notes", "date", "time"
    ]
  },

  education_tutoring_training: {
    required: ["service", "subject_or_course", "date", "time", "name", "phone"],
    optional: ["grade_level", "delivery_mode", "notes", "email"],
    confirmationFields: ["subject_or_course", "date", "time"],
    notificationFields: [
      "name", "phone", "email", "service", "subject_or_course",
      "grade_level", "delivery_mode", "notes", "date", "time"
    ]
  },

  retail_callback_and_general_service: {
    required: ["reason", "name", "phone"],
    optional: ["product_interest", "date", "time", "notes"],
    confirmationFields: ["reason"],
    notificationFields: [
      "name", "phone", "reason", "product_interest", "date", "time", "notes"
    ]
  }
};