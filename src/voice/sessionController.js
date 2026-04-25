// src/voice/sessionController.js

const { createSession, getSession, removeSession } = require("./voiceSessionStore");
const { STATES, transition } = require("./stateMachine");
const { logEvent, logDecision, logError } = require("./voiceLogger");

const { resolveTenantFromVoiceContext } = require("./tenantResolver");
const { loadClusterSchema } = require("./clusterSchemaLoader");
const { extractWorkflowTurn } = require("./workflowExtractor");
const { computeWorkflowState } = require("./workflowStateEngine");
const { composeReply } = require("./workflowReplyComposer");

const {
  getMissingRequiredSlots,
  getNextMissingRequiredSlot,
  canConfirmNow,
  getNextSlotQuestion,
} = require("./slotEnforcement");

const {
  getBusinessSlotProfile,
  normalizeBusinessType,
} = require("./businessSlotProfiles");

const PREMIUM_TONE = {
  slot: {
    date: [
      "Which date works best for you?",
      "What date would you like me to note for that?",
      "Which day would you prefer?"
    ],
    time: [
      "What time would you like?",
      "What time works best for you?",
      "And what time would you prefer?"
    ],
    name: [
      "May I have your name for the booking?",
      "Could I have your name, please?",
      "What name should I put this under?"
    ],
    phone: [
      "What’s the best phone number for the booking?",
      "May I have your phone number for the booking?",
      "Which number should we use for this booking?"
    ],
    service: [
      "What service would you like to book?",
      "How may I note the service for you?",
      "What should I put this down for?"
    ],
    type: [
      "What type would you like me to note?",
      "Which type should I put this under?",
      "How would you like this categorized?"
    ],
    party_size: [
      "How many guests should I note?",
      "For how many people?",
      "How many should I reserve for?"
    ],
      email: [
      "What email address would you like me to note?",
      "May I have your email address, please?",
      "Which email should I use for this?"
    ],
    appointment_type: [
      "What type of appointment would you like to book?",
      "What kind of appointment should I note for you?",
      "Which type of appointment would you prefer?"
    ],
    consultation_type: [
      "What type of consultation would you like to arrange?",
      "Which consultation should I note for you?",
      "What kind of consultation do you need?"
    ],
    request_type: [
      "What kind of request should I note for you?",
      "Which type of request is this?",
      "How would you like me to categorize this request?"
    ],
    address: [
      "What address should I use for the visit?",
      "Could you share the service address with me?",
      "Which address should I note for the appointment?"
    ],
    vehicle_make: [
      "What is the make of the vehicle?",
      "Which vehicle make should I note?",
      "Could you tell me the make of the vehicle?"
    ],
    vehicle_model: [
      "What is the model of the vehicle?",
      "Which vehicle model should I note?",
      "Could you tell me the model of the vehicle?"
    ],
    pet_name: [
      "What is your pet's name?",
      "Could you share your pet's name with me?",
      "What name should I note for your pet?"
    ],
    subject_or_course: [
      "Which subject or course should I note?",
      "What subject would you like help with?",
      "Which course should I put this under?"
    ]
  },

  recovery: {
    generic: [
      "Sorry, I didn’t quite catch that — could you say that again?",
      "I’m sorry, could you repeat that for me?",
      "Sorry, could you say that once more?"
    ],
    phone: [
      "Sorry, I didn’t catch the full number — could you repeat it for me?",
      "I have part of the number. Could you say the full number again?",
      "Sorry, let’s try that number once more."
    ],
    name: [
      "Sorry, I didn’t quite catch the name — could you say it again?",
      "Would you mind repeating the name for me?",
      "Sorry, could you say the name once more?"
    ]
  },

  correction: {
    generic: [
      "No problem — I’ll update that.",
      "Of course — I’ll correct that.",
      "Certainly — let me fix that for you."
    ],
    name: [
      "No problem — I’ll update the name.",
      "Of course — I’ll correct the name.",
      "Certainly — I’ll fix the name for you."
    ],
    phone: [
      "No problem — I’ll update the number.",
      "Of course — I’ll correct the phone number.",
      "Certainly — I’ll fix the number for you."
    ]
  },

  confirm: {
    lead: [
      "Just to confirm —",
      "Let me confirm that —",
      "Just confirming —"
    ],
    final: [
      "You're all set. I've confirmed that for you.",
      "Perfect — that’s all confirmed.",
      "Wonderful — I’ve taken care of that for you."
    ],
    empty: [
      "Just to confirm the details I have — is that correct?",
      "Let me confirm the details I have — is that correct?",
      "Just confirming the details I have — is that right?"
    ]
  },

  acknowledgement: {
    generic: [
      "Certainly.",
      "Of course.",
      "Absolutely.",
      "Very good."
    ],
    booking: [
      "Certainly — I can help with that.",
      "Of course — I’ll take care of that for you.",
      "Absolutely — let’s get that arranged."
    ]
  },

  greeting: [
    "Good day, and thank you for calling. How may I assist you?",
    "Thank you for calling. How may I help you today?",
    "Hello, and thank you for calling. How may I assist you today?"
  ],

  prompts: {
    nextDetail: [
      "Certainly. What’s the next detail I should note?",
      "Of course. What’s the next detail you’d like to share?",
      "Very good. What should I note next?"
    ],
      closing: [
    "Happy to help — have a wonderful day.",
    "You're all set. Enjoy your day.",
    "My pleasure — have a great day ahead."
  ],
    phoneConfirm: [
      "Yes — I have {phone}.",
      "Certainly — I have {phone}.",
      "Yes, I’ve noted {phone}."
    ],
    nameUpdated: [
      "No problem — I’ll use {name}.",
      "Of course — I’ll note the name as {name}.",
      "Certainly — I’ll update that to {name}."
    ],
    error: [
      "I’m sorry — something went wrong. Please try again.",
      "Sorry — something went wrong. Please try again."
    ],
    confirmOnce: [
      "Just to confirm —",
      "Let me confirm that —",
      "Just confirming —"
    ]
  }
};

function pickPremiumLine(options, session, key) {
  if (!Array.isArray(options) || !options.length) return "";

  const safeSession = session || {};
  safeSession.__premiumToneCursor = safeSession.__premiumToneCursor || {};

  const current = safeSession.__premiumToneCursor[key] || 0;
  const value = options[current % options.length];
  safeSession.__premiumToneCursor[key] = current + 1;

  return value;
}
function deriveBusinessTypeFromCluster(clusterId) {
  if (!clusterId) return "generic";
  return String(clusterId).trim().toLowerCase();
}

function logClusterState(prefix, session) {
  try {
    console.log(`[voice][cluster] ${prefix}`, {
      sessionId: session?.id || null,
      tenantId: session?.tenantId || null,
      clusterId: session?.clusterId || null,
      businessType: session?.businessType || null,
      requiredSlots: session?.requiredSlots || [],
      extractedSlots: session?.slots || {},
    });
  } catch (_) {}
}

function getPremiumSlotKey(slotName) {
  const slot = String(slotName || "").toLowerCase().trim();

  if (!slot) return "";

  if (slot.includes("date") || slot.includes("day")) return "date";
  if (slot.includes("time_window") || slot.includes("window")) return "time";
  if (slot.includes("time")) return "time";

  if (
    slot.includes("party") ||
    slot.includes("size") ||
    slot.includes("guest") ||
    slot.includes("people") ||
    slot.includes("person") ||
    slot.includes("count")
  ) {
    return "party_size";
  }

  if (slot.includes("name")) return "name";

  if (
    slot.includes("phone") ||
    slot.includes("number") ||
    slot.includes("mobile") ||
    slot.includes("contact")
  ) {
    return "phone";
  }

  if (slot.includes("email")) return "email";

  if (slot.includes("appointment_type")) return "appointment_type";
  if (slot.includes("consultation_type")) return "consultation_type";
  if (slot.includes("request_type")) return "request_type";
  if (slot.includes("address")) return "address";
  if (slot.includes("vehicle_make")) return "vehicle_make";
  if (slot.includes("vehicle_model")) return "vehicle_model";
  if (slot.includes("pet_name")) return "pet_name";
  if (slot.includes("subject_or_course")) return "subject_or_course";

  if (
    slot.includes("visit_type") ||
    slot.includes("reason") ||
    slot.includes("purpose") ||
    slot === "type" ||
    slot.endsWith("_type")
  ) {
    return "type";
  }

  if (
    slot.includes("service") ||
    slot.includes("subject") ||
    slot.includes("course") ||
    slot.includes("treatment") ||
    slot.includes("issue") ||
    slot.includes("problem") ||
    slot.includes("matter") ||
    slot.includes("symptom") ||
    slot.includes("vehicle_year") ||
    slot.includes("pet_type") ||
    slot.includes("breed") ||
    slot.includes("property_reference") ||
    slot.includes("location_preference") ||
    slot.includes("doctor_preference") ||
    slot.includes("provider_preference") ||
    slot.includes("trainer_preference") ||
    slot.includes("staff_preference")
  ) {
    return "service";
  }

  return "service";
}

function getPremiumSlotQuestion(slotName, session) {
  const premiumSlotKey = getPremiumSlotKey(slotName);
  const options =
    PREMIUM_TONE.slot[premiumSlotKey] ||
    PREMIUM_TONE.slot.type ||
    ["What detail would you like me to note?"];

  const base = pickPremiumLine(
    options,
    session,
    `slot:${premiumSlotKey || slotName}`
  );

  const connector = pickPremiumLine(
    ["", "Perfect — ", "Got it — ", "Lovely — "],
    session,
    `connector:${premiumSlotKey || slotName}`
  );

  return `${connector}${base}`.trim();
}

function getPremiumRecoveryLine(kind, session) {
  const options =
    PREMIUM_TONE.recovery[kind] ||
    PREMIUM_TONE.recovery.generic;

  return pickPremiumLine(options, session, `recovery:${kind}`);
}

function getPremiumCorrectionLine(kind, session) {
  const options =
    PREMIUM_TONE.correction[kind] ||
    PREMIUM_TONE.correction.generic;

  return pickPremiumLine(options, session, `correction:${kind}`);
}

function getPremiumConfirmLead(session) {
  return pickPremiumLine(PREMIUM_TONE.confirm.lead, session, "confirm:lead");
}

function getPremiumFinalConfirmation(session) {
  return pickPremiumLine(PREMIUM_TONE.confirm.final, session, "confirm:final");
}

function getPremiumEmptyConfirmation(session) {
  return pickPremiumLine(PREMIUM_TONE.confirm.empty, session, "confirm:empty");
}

function getPremiumAcknowledgement(kind, session) {
  const options =
    PREMIUM_TONE.acknowledgement[kind] ||
    PREMIUM_TONE.acknowledgement.generic;

  return pickPremiumLine(options, session, `ack:${kind}`);
}

function getPremiumPrompt(kind, session) {
  const options = PREMIUM_TONE.prompts[kind] || [];
  return pickPremiumLine(options, session, `prompt:${kind}`);
}

// 🔹 Wrap original slot question builder with premium tone
function getPremiumNextSlotQuestion(businessType, slotName, session) {
  return getPremiumSlotQuestion(slotName, session);
}

function handleCallStarted(callSid, meta = {}) {
  let session = getSession(callSid);

  if (!session) {
    session = createSession(callSid, meta);
  }

  if (!session.workflow) {
    session.workflow = null;
  }

  if (!session.workflowSlots) {
    session.workflowSlots = {};
  }

  if (!session.slots) {
    session.slots = {};
  }

  if (!session.active_intent) {
    session.active_intent = null;
  }

  if (!session.workflowStatus) {
    session.workflowStatus = "idle";
  }

  if (!session.clusterId) {
    session.clusterId = null;
  }

  if (!session.tenantId) {
    session.tenantId = null;
  }

  if (!session.businessId) {
    session.businessId = null;
  }

  if (!session.businessType) {
    session.businessType = "generic";
  }

  if (!session.requiredSlots) {
    session.requiredSlots = [];
  }

  if (!session.optionalSlots) {
    session.optionalSlots = [];
  }

  if (typeof session.confirmationBlocked !== "boolean") {
    session.confirmationBlocked = true;
  }
  if (!session.lastAskedSlot) {
    session.lastAskedSlot = null;
  }

  if (!session.phoneCapture) {
    session.phoneCapture = {
      active: false,
      digits: "",
      startedAt: null,
    };
  }

  if (!session.lastAssistantReply) {
    session.lastAssistantReply = null;
  }

  if (!session.lastCallerText) {
    session.lastCallerText = null;
  }

  if (!session.recentTurns) {
    session.recentTurns = [];
  }

  transition(session, STATES.GREETING, "call_started");

  logEvent(callSid, "CALL_STARTED", meta);

  return session;
}

function handleGreeting(callSid) {
  const session = getSession(callSid);
  if (!session) return null;

  if (session.greeted) {
    logDecision(callSid, "Greeting skipped (already greeted)");
    return null;
  }

  session.greeted = true;

  transition(session, STATES.LISTENING, "greeting_sent");

  const reply = {
    shouldSpeak: true,
    replyText: pickPremiumLine(PREMIUM_TONE.greeting, session, "greeting"),
    replyType: "greeting",
  };

  logDecision(callSid, "Sending greeting");

  return reply;
}

function handleTranscriptPartial(callSid, text) {
  const session = getSession(callSid);
  if (!session) return;

  session.partialTranscript = text;
  session.lastUserSpeechAt = Date.now();

  if (
    session.state === STATES.LISTENING ||
    session.state === STATES.AWAITING_INPUT
  ) {
    transition(session, STATES.AWAITING_END_OF_TURN, "user_started_speaking");
  }

  logEvent(callSid, "TRANSCRIPT_PARTIAL", { text });
}

function handleTranscriptFinal(callSid, text) {
  const session = getSession(callSid);
  if (!session) return null;

  session.finalTranscriptBuffer = text;
  session.lastUserSpeechAt = Date.now();

  logEvent(callSid, "TRANSCRIPT_FINAL", { text });

  if (!text || text.trim().length < 3) {
    logDecision(callSid, "Ignoring short/invalid transcript");
    return null;
  }

  transition(session, STATES.PROCESSING, "final_transcript_received");

  session.isProcessing = true;

  return {
    shouldProcess: true,
    text,
  };
}

function normalizeText(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim();
}

function isUsableReply(text) {
  return normalizeText(text).length > 0;
}

function normalizeSlotName(slotName) {
  return String(slotName || "")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .trim();
}

function titleCase(text) {
  return normalizeText(text)
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function formatPhone(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length === 10) {
    return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
  }
  return String(phone || "");
}

function buildConversationTranscript(session) {
  return (session?.recentTurns || [])
    .map((turn) => `${turn.role}: ${normalizeText(turn.text)}`)
    .filter(Boolean)
    .join("\n");
}

function applyBusinessSlotProfile(session, clusterSchema = null) {
  const clusterId = String(
    session?.clusterId ||
    clusterSchema?.cluster_id ||
    clusterSchema?.clusterId ||
    ""
  ).trim().toLowerCase();

  const schemaBusinessType =
    clusterSchema?.businessType ||
    clusterSchema?.business_type ||
    deriveBusinessTypeFromCluster(clusterId) ||
    session?.businessType ||
    "generic";

  const businessType = normalizeBusinessType(schemaBusinessType);
  const profile = getBusinessSlotProfile(businessType);

  session.clusterId = clusterId || session.clusterId || null;
  session.businessType = businessType;
  session.clusterSchema = clusterSchema || session.clusterSchema || null;
  session.requiredSlots = Array.isArray(profile.required) ? [...profile.required] : [];
  session.optionalSlots = Array.isArray(profile.optional) ? [...profile.optional] : [];

  logClusterState("applyBusinessSlotProfile", session);

  return profile;
}

function extractDateValue(text) {
  const value = normalizeText(text).toLowerCase();
  if (!value) return "";

  const directDay = value.match(
    /\b(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i
  );
  if (directDay) {
    return directDay[1];
  }

  const monthDay = value.match(
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?\b/i
  );
  if (monthDay) {
    return `${monthDay[1]} ${monthDay[2]}`;
  }

  const dayMonth = value.match(
    /\b(\d{1,2})(?:st|nd|rd|th)?(?:\s+of)?\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/i
  );
  if (dayMonth) {
    return `${dayMonth[2]} ${dayMonth[1]}`;
  }

  const numericDate = value.match(/\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/);
  if (numericDate) {
    return numericDate[0];
  }

  return "";
}

function extractTimeValue(text) {
  const value = normalizeText(text).toLowerCase();
  if (!value) return "";

  const explicit = value.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
  if (explicit) {
    let hour = Number(explicit[1]);
    const mins = explicit[2] || "00";
    const period = explicit[3].toUpperCase();

    if (hour === 0) hour = 12;
    if (hour > 12) hour = ((hour - 1) % 12) + 1;

    return `${hour}:${mins} ${period}`;
  }

  const evening = value.match(/\b(\d{1,2})\s*(?:in the)?\s*(evening|night)\b/i);
  if (evening) {
    let hour = Number(evening[1]);
    if (hour === 0) hour = 12;
    if (hour > 12) hour = ((hour - 1) % 12) + 1;
    return `${hour}:00 PM`;
  }

  const morning = value.match(/\b(\d{1,2})\s*(?:in the)?\s*(morning)\b/i);
  if (morning) {
    let hour = Number(morning[1]);
    if (hour === 0) hour = 12;
    if (hour > 12) hour = ((hour - 1) % 12) + 1;
    return `${hour}:00 AM`;
  }

  const atTime = value.match(/\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i);
  if (atTime) {
    let hour = Number(atTime[1]);
    const mins = atTime[2] || "00";
    const period = atTime[3] ? atTime[3].toUpperCase() : "";

    if (hour === 0) hour = 12;
    if (hour > 12) hour = ((hour - 1) % 12) + 1;

    if (period) {
      return `${hour}:${mins} ${period}`;
    }

    return `${hour}:${mins}`;
  }

  const simple = value.match(/\b(\d{1,2})\b/);
  const hasPm = /\b(pm|evening|night)\b/.test(value);
  const hasAm = /\b(am|morning)\b/.test(value);

  if (simple) {
    let hour = Number(simple[1]);
    if (hour === 0) hour = 12;
    if (hour > 12) hour = ((hour - 1) % 12) + 1;

    if (hasPm) return `${hour}:00 PM`;
    if (hasAm) return `${hour}:00 AM`;

    return `${hour}:00`;
  }

  return "";
}

function extractNameValue(text) {
  const value = normalizeText(text);
  if (!value) return "";

  const prefixed = value.match(
    /\b(?:my name is|this is|i am)\s+([A-Za-z][A-Za-z'-]*(?:\s+[A-Za-z][A-Za-z'-]*){0,2})\b/i
  );
  if (prefixed) {
    return titleCase(prefixed[1]);
  }

  if (/^[A-Za-z][A-Za-z'-]*(?:\s+[A-Za-z][A-Za-z'-]*){0,2}$/.test(value)) {
    return titleCase(value);
  }

  return "";
}

function extractCountValue(text) {
  const value = normalizeText(text);
  if (!value) return "";

  const numeric = value.match(/\b\d{1,2}\b/);
  return numeric ? numeric[0] : "";
}

function extractPhoneValue(text) {
  const value = normalizeText(text);
  if (!value) return "";

  const phone = value.match(/(?:\+?\d[\d\s()-]{6,}\d)/);
  return phone ? normalizeText(phone[0]) : "";
}

function extractEmailValue(text) {
  const value = normalizeText(text);
  if (!value) return "";

  const email = value.match(/[^\s@]+@[^\s@]+\.[^\s@]+/);
  return email ? email[0] : "";
}

function extractTypeValue(text) {
  const value = normalizeText(text);
  if (!value) return "";

  const cleaned = value
    .replace(/^(it'?s|it is|for|a|an)\s+/i, "")
    .replace(/\bappointment\b/gi, "appointment")
    .trim();

  if (!cleaned) return "";

  if (/^(general|general visit|consultation|checkup|follow up|follow-up|repair|table|reservation|meeting|haircut|visit)$/i.test(cleaned)) {
    return cleaned;
  }

  if (cleaned.split(/\s+/).length <= 4) {
    return cleaned;
  }

  return "";
}

function inferSlotValueFromUtterance(slotName, utterance) {
  const normalizedSlot = normalizeSlotName(slotName);
  const text = normalizeText(utterance);

  if (!normalizedSlot || !text) return "";

  if (normalizedSlot.includes("date") || normalizedSlot.includes("day")) {
    return extractDateValue(text);
  }

  if (normalizedSlot.includes("time")) {
    return extractTimeValue(text);
  }

  if (normalizedSlot.includes("name")) {
    return extractNameValue(text);
  }

  if (
    normalizedSlot.includes("party") ||
    normalizedSlot.includes("size") ||
    normalizedSlot.includes("guest") ||
    normalizedSlot.includes("people") ||
    normalizedSlot.includes("person")
  ) {
    return extractCountValue(text);
  }

  if (normalizedSlot.includes("phone")) {
    return extractPhoneValue(text);
  }

  if (normalizedSlot.includes("email")) {
    return extractEmailValue(text);
  }

  if (
  normalizedSlot.includes("appointment_type") ||
  normalizedSlot.includes("consultation_type") ||
  normalizedSlot.includes("request_type") ||
  normalizedSlot.includes("visit_type") ||
  normalizedSlot.includes("type") ||
  normalizedSlot.includes("reason") ||
  normalizedSlot.includes("purpose") ||
  normalizedSlot.includes("service")
) {
  return extractTypeValue(text);
}

  return "";
}

function inferHeuristicSlotsFromUtterance(session, utterance) {
  const inferred = {};
  const text = normalizeText(utterance);
  if (!text) return inferred;

const expectedSlot = normalizeSlotName(session?.lastAskedSlot || "");
const rawExpectedSlotName = session?.lastAskedSlot || "";

const expectedValue = inferSlotValueFromUtterance(expectedSlot, text);
if (expectedSlot && expectedValue) {
  inferred[rawExpectedSlotName] = expectedValue;
} else if (expectedSlot && text) {
  const directCaptureSlots = new Set([
    "appointment_type",
    "consultation_type",
    "request_type",
    "service",
    "address",
    "vehicle_make",
    "vehicle_model",
    "pet_name",
    "subject_or_course",
  ]);

  if (directCaptureSlots.has(rawExpectedSlotName)) {
    inferred[rawExpectedSlotName] = text;
  }
}
  const dateValue = extractDateValue(text);
  if (dateValue) {
    inferred.date = inferred.date || dateValue;
  }

  const timeValue = extractTimeValue(text);
  if (timeValue) {
    inferred.time = inferred.time || timeValue;
  }

  const nameValue = extractNameValue(text);
  if (nameValue) {
    inferred.name = inferred.name || nameValue;
  }

  const partySizeMatch = text.match(/\bfor\s+(\d{1,2})\b/i);
  if (partySizeMatch) {
    inferred.party_size = inferred.party_size || partySizeMatch[1];
  }

  const bookingIntent =
    /\b(book|booking|reserve|reservation|table)\b/i.test(text);

  if (bookingIntent) {
    inferred.intent = inferred.intent || "reservation";
    inferred.type = inferred.type || "table";
  }

  const typeValue = extractTypeValue(text);
if (typeValue) {
  if (
    session?.businessType === "medical" ||
    session?.businessType === "medical_clinic" ||
    session?.businessType === "dental_vision"
  ) {
    inferred.appointment_type = inferred.appointment_type || typeValue;
  } else if (
    session?.businessType === "legal_finance_consulting"
  ) {
    inferred.consultation_type = inferred.consultation_type || typeValue;
  } else if (
    session?.businessType === "real_estate_property"
  ) {
    inferred.request_type = inferred.request_type || typeValue;
  } else {
    inferred.type = inferred.type || typeValue;
  }
}

  return inferred;
}

function inferHolisticSlotsFromConversation(session) {
  const transcript = buildConversationTranscript(session);
  const inferred = {};

  if (!transcript) return inferred;

  const dateValue = extractDateValue(transcript);
  if (dateValue) inferred.date = dateValue;

  const timeValue = extractTimeValue(transcript);
  if (timeValue) inferred.time = timeValue;

  const nameValue = extractNameValue(transcript);
  if (nameValue) inferred.name = nameValue;

const typeValue = extractTypeValue(transcript);
if (typeValue) {
  if (
    session?.businessType === "medical" ||
    session?.businessType === "medical_clinic" ||
    session?.businessType === "dental_vision"
  ) {
    inferred.appointment_type = typeValue;
  } else if (
    session?.businessType === "legal_finance_consulting"
  ) {
    inferred.consultation_type = typeValue;
  } else if (
    session?.businessType === "real_estate_property"
  ) {
    inferred.request_type = typeValue;
  } else {
    inferred.type = typeValue;
  }
}

  const phoneValue = extractPhoneValue(transcript);
  if (phoneValue) inferred.phone = phoneValue;

  const emailValue = extractEmailValue(transcript);
  if (emailValue) inferred.email = emailValue;

  const expectedSlot = normalizeSlotName(session?.lastAskedSlot || "");
  if (expectedSlot) {
    const expectedValue = inferSlotValueFromUtterance(expectedSlot, transcript);
    if (expectedValue && session.lastAskedSlot) {
      inferred[session.lastAskedSlot] = expectedValue;
    }
  }

  return inferred;
}

function normalizeExtractedSlotsForSession(session, rawSlots = {}) {
  const normalized = { ...(rawSlots || {}) };
  const clusterId = String(session?.clusterId || "").trim().toLowerCase();
  const businessType = String(session?.businessType || "").trim().toLowerCase();

  if (!normalized.phone && normalized.phone_number) {
    normalized.phone = normalized.phone_number;
  }

  if (!normalized.name && normalized.full_name) {
    normalized.name = normalized.full_name;
  }

  const isClinic =
    clusterId === "medical_clinic" ||
    clusterId === "dental_vision" ||
    businessType === "medical";

  const isConsulting =
    clusterId === "legal_finance_consulting" ||
    businessType === "legal_finance_consulting";

  const isProperty =
    clusterId === "real_estate_property" ||
    businessType === "real_estate_property";

  if (isClinic && !normalized.appointment_type) {
    normalized.appointment_type =
      normalized.appointment_type ||
      normalized.type ||
      normalized.service ||
      normalized.service_type ||
      "";
  }

  if (isConsulting && !normalized.consultation_type) {
    normalized.consultation_type =
      normalized.consultation_type ||
      normalized.type ||
      normalized.service ||
      normalized.service_type ||
      "";
  }

  if (isProperty && !normalized.request_type) {
    normalized.request_type =
      normalized.request_type ||
      normalized.type ||
      normalized.service ||
      normalized.service_type ||
      "";
  }

  if ((clusterId === "auto_service" || businessType === "auto_service") && !normalized.vehicle_make && normalized.make) {
    normalized.vehicle_make = normalized.make;
  }

  if ((clusterId === "auto_service" || businessType === "auto_service") && !normalized.vehicle_model && normalized.model) {
    normalized.vehicle_model = normalized.model;
  }

  if ((clusterId === "home_services" || businessType === "home_services") && !normalized.address && normalized.location) {
    normalized.address = normalized.location;
  }

  return normalized;
}

function mergeSlotsWithoutEmpty(existingSlots = {}, incomingSlots = {}) {
  const merged = { ...existingSlots };

  for (const [key, value] of Object.entries(incomingSlots || {})) {
    if (value === null || value === undefined) continue;
    const normalized = normalizeText(value);
    if (!normalized) continue;
    merged[key] = normalized;
  }

  return merged;
}

function getSlotValueByAlias(slots = {}, aliases = []) {
  const entries = Object.entries(slots || {});

  for (const [key, value] of entries) {
    const normalizedKey = normalizeSlotName(key);
    const normalizedValue = normalizeText(value);

    if (!normalizedValue) continue;

    if (aliases.some((alias) => normalizedKey.includes(alias))) {
      return normalizedValue;
    }
  }

  return "";
}

function buildConfirmationReplyFromSession(session) {
  const missingRequired = getNextMissingRequiredSlot(
    session?.businessType || "generic",
    session?.slots || {}
  );

  if (missingRequired) {
    return getPremiumNextSlotQuestion(
      session?.businessType || "generic",
      missingRequired,
      session
    );
  }

  const slots = session?.slots || {};
  const values = Object.entries(slots)
    .filter(([, value]) => normalizeText(value))
    .map(([key, value]) => ({ key, value: normalizeText(value) }));

  if (!values.length) {
    return getPremiumEmptyConfirmation(session);
  }

  const findValue = (matcher) => {
    const hit = values.find(({ key }) => matcher(String(key).toLowerCase()));
    return hit ? hit.value : "";
  };

  const dateValue =
    findValue((key) => key.includes("date") || key.includes("day")) || "";
  const timeValue =
    findValue((key) => key.includes("time")) || "";
  const nameValue =
    findValue((key) => key.includes("name")) || "";
  const phoneValue =
    findValue((key) => key.includes("phone") || key.includes("number")) || "";
  const partyValue =
    findValue((key) =>
      key.includes("party") ||
      key.includes("size") ||
      key.includes("guest") ||
      key.includes("people") ||
      key.includes("person")
    ) || "";

  const serviceValue =
    findValue((key) =>
      key.includes("service") ||
      key.includes("type") ||
      key.includes("reason") ||
      key.includes("purpose")
    ) || "";

  const parts = [];

if (serviceValue && session?.businessType === "medical") {
  parts.push(serviceValue);
}

if (dateValue) parts.push(dateValue);
if (timeValue) parts.push(`at ${timeValue}`);
if (partyValue) parts.push(`for ${partyValue}`);

if (parts.length > 0) {
  return `${getPremiumConfirmLead(session)} ${parts.join(" ")}. Is that correct?`;
}

  return getPremiumEmptyConfirmation(session);
}

function buildSlotQuestion(slotName, session = null) {
  const slot = String(slotName || "").toLowerCase();

  if (!slot) {
    return getPremiumRecoveryLine("generic", session);
  }

  if (slot.includes("date") || slot.includes("day")) {
    return getPremiumSlotQuestion("date", session);
  }

  if (slot.includes("time")) {
    return getPremiumSlotQuestion("time", session);
  }

  if (
    slot.includes("party") ||
    slot.includes("size") ||
    slot.includes("guest") ||
    slot.includes("people") ||
    slot.includes("person")
  ) {
    return getPremiumSlotQuestion("party_size", session);
  }

  if (slot.includes("name")) {
    return getPremiumSlotQuestion("name", session);
  }

  if (slot.includes("phone")) {
    return getPremiumSlotQuestion("phone", session);
  }

  if (slot.includes("email")) {
    return getPremiumSlotQuestion("email", session);
  }

  if (
    slot.includes("type") ||
    slot.includes("reason") ||
    slot.includes("purpose") ||
    slot.includes("service")
  ) {
    return getPremiumSlotQuestion("type", session);
  }

  return getPremiumRecoveryLine("generic", session);
}

function buildSafeFallbackReply(session) {
  const workflowStatus = String(session?.workflowStatus || "").toLowerCase();

  const missingRequired = getNextMissingRequiredSlot(
    session?.businessType || "generic",
    session?.slots || {}
  );

  if (missingRequired) {
    return getPremiumNextSlotQuestion(
      session?.businessType || "generic",
      missingRequired,
      session
    );
  }

  if (workflowStatus === "ready_for_confirmation" || workflowStatus === "completed") {
    return buildConfirmationReplyFromSession(session);
  }

  if (session?.lastAskedSlot) {
    return getPremiumNextSlotQuestion(
      session?.businessType || "generic",
      session.lastAskedSlot,
      session
    );
  }

  const slots = session?.slots || {};
  const knownSlotCount = Object.keys(slots).filter((key) => normalizeText(slots[key])).length;

  if (knownSlotCount > 0) {
    return getPremiumPrompt("nextDetail", session);
  }

  return getPremiumRecoveryLine("generic", session);
}

function pushRecentTurn(session, role, text) {
  if (!session.recentTurns) {
    session.recentTurns = [];
  }

  session.recentTurns.push({
    role,
    text,
    at: Date.now(),
  });

  if (session.recentTurns.length > 12) {
    session.recentTurns = session.recentTurns.slice(-12);
  }
}

function handleProcessingResult(callSid, brainResult) {
  const session = getSession(callSid);
  if (!session) return null;

  session.isProcessing = false;

  if (!brainResult || !brainResult.shouldSpeak) {
    transition(session, STATES.LISTENING, "no_reply_needed");
    return null;
  }

  let replyText = normalizeText(brainResult.replyText);

  if (!isUsableReply(replyText)) {
    replyText = buildSafeFallbackReply(session);

    logDecision(callSid, "Empty processing reply replaced with fallback", {
      workflowStatus: session.workflowStatus,
      lastAskedSlot: session.lastAskedSlot,
      slots: session.slots || {},
      fallbackReplyText: replyText,
    });
  }

  if (session.confirmationBlocked && !canConfirmNow(session.businessType, session.slots)) {
  const nextMissingSlot = getNextMissingRequiredSlot(
    session.businessType || "generic",
    session.slots || {}
  );

  if (nextMissingSlot) {
    const slotPrompt = getPremiumNextSlotQuestion(
      session.businessType || "generic",
      nextMissingSlot,
      session
    );

    if (!session.lastAssistantReply) {
      replyText = `${getPremiumAcknowledgement("booking", session)} ${slotPrompt}`;
    } else {
      replyText = slotPrompt;
    }

    session.lastAskedSlot = nextMissingSlot;
  }
}

  if (replyText === normalizeText(session.lastAssistantReply)) {
    if (session.lastAskedSlot) {
      replyText = getPremiumNextSlotQuestion(
        session.businessType || "generic",
        session.lastAskedSlot,
        session
      );
    } else {
      replyText = getPremiumRecoveryLine("generic", session);
    }
  }

  session.lastAssistantReply = replyText;

  if (isUsableReply(replyText)) {
    pushRecentTurn(session, "assistant", replyText);
  }

  transition(session, STATES.READY_TO_SPEAK, "brain_ready");

  return {
    shouldSpeak: true,
    replyText,
    replyType: brainResult.replyType || "reply",
  };
}

function handleSpeak(callSid) {
  const session = getSession(callSid);
  if (!session) return;

  session.isSpeaking = true;

  transition(session, STATES.SPEAKING, "tts_start");
}

function handleSpeechComplete(callSid) {
  const session = getSession(callSid);
  if (!session) return;

  session.isSpeaking = false;

  transition(session, STATES.AWAITING_INPUT, "tts_complete");
}

function handleCallEnded(callSid) {
  const session = getSession(callSid);
  if (!session) return;

  transition(session, STATES.ENDED, "call_ended");

  removeSession(callSid);

  logEvent(callSid, "CALL_ENDED");
}

async function handleCallerTurn({ callSid, businessId = null, transcript, meta = {} }) {
  const session = getSession(callSid);

  if (!session) {
    logError(callSid, "handleCallerTurn called without session");
    return {
      shouldSpeak: true,
      replyText: getPremiumRecoveryLine("generic", null),
      replyType: "repair",
    };
  }

  const utterance = normalizeText(transcript);
  session.lastCallerText = utterance;

  const askingPhoneConfirm =
    /\b(confirm.*(phone|number)|what.*(phone|number)|did you get.*(phone|number))\b/i.test(utterance);

  if (askingPhoneConfirm && session?.slots?.phone) {
    const template = getPremiumPrompt("phoneConfirm", session) || "Yes — I have {phone}.";
    return {
      shouldSpeak: true,
      replyText: template.replace("{phone}", formatPhone(session.slots.phone)),
      replyType: "ai",
    };
  }

  const correctingName =
    /\bno my name is\b/i.test(utterance);

  if (correctingName) {
    const newName = extractNameValue(utterance);
    if (newName) {
      session.slots.name = newName;

      const template = getPremiumPrompt("nameUpdated", session) || "No problem — I’ll use {name}.";
      return {
        shouldSpeak: true,
        replyText: template.replace("{name}", newName),
        replyType: "ai",
      };
    }
  }

  if (!utterance) {
    logDecision(callSid, "Empty caller turn ignored");
    return {
      shouldSpeak: false,
      replyText: "",
      replyType: "noop",
    };
  }

  const isClosing =
  /\b(thank you|thanks|bye|goodbye|that’s all|thats all|appreciate it)\b/i.test(utterance);

if (isClosing) {
  return {
    shouldSpeak: true,
    replyText: getPremiumPrompt("closing", session),
    replyType: "closing",
  };
}

  pushRecentTurn(session, "caller", utterance);

  let routing;
  try {
    routing = await resolveTenantFromVoiceContext({
      callSid,
      businessId,
      ...meta,
    });
  } catch (err) {
    logError(callSid, "Tenant resolution crashed", {
      error: err.message,
      businessId,
      meta,
    });

    return {
      shouldSpeak: true,
      replyText: getPremiumPrompt("error", session) || "Sorry — something went wrong. Please try again.",
      replyType: "error",
    };
  }

  if (!routing || !routing.ok || !routing.tenantId || !routing.clusterId) {
    logError(callSid, "Tenant resolution failed", routing || { businessId, meta });

    return {
      shouldSpeak: true,
      replyText: getPremiumPrompt("error", session) || "Sorry — something went wrong. Please try again.",
      replyType: "error",
    };
  }

  session.tenantId = routing.tenantId || null;
  session.businessId = routing.businessId || businessId || null;
  session.clusterId = routing.clusterId || null;

  logDecision(callSid, "Tenant cluster resolved", {
  tenantId: session.tenantId,
  businessId: session.businessId,
  clusterId: session.clusterId,
  businessType: session.businessType,
});

 
  let clusterSchema;
  try {
    clusterSchema = await loadClusterSchema(session.clusterId);
  } catch (err) {
    logError(callSid, "Cluster schema load failed", {
      error: err.message,
      clusterId: session.clusterId,
      tenantId: session.tenantId,
    });

    return {
      shouldSpeak: true,
      replyText: getPremiumPrompt("error", session) || "Sorry — something went wrong. Please try again.",
      replyType: "error",
    };
  }

  applyBusinessSlotProfile(session, clusterSchema);

  logDecision(callSid, "Cluster profile applied", {
  tenantId: session.tenantId,
  clusterId: session.clusterId,
  businessType: session.businessType,
  requiredSlots: session.requiredSlots,
  optionalSlots: session.optionalSlots,
});

  let extraction;
  try {
    extraction = await extractWorkflowTurn({
      clusterId: session.clusterId,
      clusterSchema,
      session,
      utterance,
      recentTurns: session.recentTurns || [],
    });
  } catch (err) {
    logError(callSid, "Workflow extraction failed", {
      error: err.message,
      clusterId: session.clusterId,
      tenantId: session.tenantId,
      utterance,
    });

    return {
      shouldSpeak: true,
      replyText: getPremiumRecoveryLine("generic", session),
      replyType: "repair",
    };
  }

 const deterministicSlots = inferHeuristicSlotsFromUtterance(session, utterance);
const holisticSlots = inferHolisticSlotsFromConversation(session);
const extractionSlots = extraction?.slots || {};

const combinedExtractionSlots = normalizeExtractedSlotsForSession(
  session,
  mergeSlotsWithoutEmpty(
    mergeSlotsWithoutEmpty(extractionSlots, deterministicSlots),
    holisticSlots
  )
);

const effectiveExtraction = {
  ...(extraction || {}),
  slots: combinedExtractionSlots,
  slot_updates: mergeSlotsWithoutEmpty(
    extraction?.slot_updates || {},
    combinedExtractionSlots
  ),
};

  let workflowState;
  try {
    workflowState = computeWorkflowState({
      clusterSchema,
      session,
      extraction: effectiveExtraction,
    });
  } catch (err) {
    logError(callSid, "Workflow state computation failed", {
      error: err.message,
      extraction: effectiveExtraction,
      clusterId: session.clusterId,
      tenantId: session.tenantId,
    });

    return {
      shouldSpeak: true,
      replyText: getPremiumRecoveryLine("generic", session),
      replyType: "repair",
    };
  }

  session.active_intent = workflowState.intent || session.active_intent || null;
  session.workflow = workflowState.intent || session.workflow || null;

const newSlots = normalizeExtractedSlotsForSession(
  session,
  mergeSlotsWithoutEmpty(
    mergeSlotsWithoutEmpty(workflowState.slots || {}, deterministicSlots),
    holisticSlots
  )
);


session.slots = normalizeExtractedSlotsForSession(
  session,
  mergeSlotsWithoutEmpty(session.slots, newSlots)
);

session.workflowSlots = normalizeExtractedSlotsForSession(
  session,
  mergeSlotsWithoutEmpty(session.workflowSlots || {}, newSlots)
);

logDecision(callSid, "Cluster slots normalized", {
  tenantId: session.tenantId,
  clusterId: session.clusterId,
  businessType: session.businessType,
  requiredSlots: session.requiredSlots,
  extractedSlots: newSlots,
  sessionSlots: session.slots,
});

  
// 📊 ADD THIS DEBUG RIGHT HERE
logDecision(callSid, "Normalized slot aliases", {
  businessType: session.businessType,
  slots: session.slots,
  newSlots,
});

 const missingRequired = getMissingRequiredSlots(
  session.businessType || "generic",
  session.slots || {}
);

logDecision(callSid, "Required slot resolution", {
  tenantId: session.tenantId,
  clusterId: session.clusterId,
  businessType: session.businessType,
  requiredSlots: session.requiredSlots,
  extractedSlots: session.slots,
  missingRequired,
});


session.confirmationBlocked = missingRequired.length > 0;

const has = (key) => !!normalizeText(session.slots?.[key]);

let coreComplete = false;

switch (session.businessType) {
  case "restaurant":
  case "restaurant_hospitality":
    coreComplete = has("date") && has("time") && has("party_size");
    break;

  case "medical":
  case "medical_clinic":
  case "dental_vision":
    coreComplete = has("appointment_type") && has("date") && has("time");
    break;

  case "salon":
  case "beauty_salon_spa":
  case "fitness_wellness":
    coreComplete = (has("service") || has("type")) && has("date") && has("time");
    break;

  case "auto_service":
    coreComplete =
      has("service") &&
      has("vehicle_make") &&
      has("vehicle_model") &&
      has("date") &&
      has("time");
    break;

  case "home_services":
    coreComplete = has("service") && has("address") && has("date") && has("time_window");
    break;

  case "legal_finance_consulting":
    coreComplete = has("consultation_type") && has("date") && has("time");
    break;

  case "pet_services":
    coreComplete = has("service") && has("pet_name") && has("date") && has("time");
    break;

  case "real_estate_property":
    coreComplete = has("request_type") && has("property_reference") && has("date") && has("time");
    break;

  case "education_tutoring_training":
    coreComplete = has("subject_or_course") && has("date") && has("time");
    break;

  default:
    coreComplete = has("date") && has("time");
    break;
}

if (coreComplete && !has("name")) {
  session.lastAskedSlot = "name";
} else if (coreComplete && has("name") && !has("phone")) {
  session.lastAskedSlot = "phone";
} else if (missingRequired.length > 0) {
  session.lastAskedSlot = getNextMissingRequiredSlot(
    session.businessType || "generic",
    session.slots || {}
  );
} else {
  session.lastAskedSlot = null;
}

  // 🔥 Detect if we just filled the expected slot
  const expectedSlot = session.lastAskedSlot;
  const justFilledValue = expectedSlot ? session.slots[expectedSlot] : null;

  if (expectedSlot && justFilledValue) {
    logDecision(callSid, "Slot captured", {
      slot: expectedSlot,
      value: justFilledValue,
    });
  }

  session.workflowStatus = workflowState.workflowStatus || "idle";

  if (
  session.workflowStatus === "ready_for_confirmation" ||
  session.workflowStatus === "completed"
) {
  session.lastAskedSlot = null;
  session.confirmationBlocked = false;

  const replyText = buildConfirmationReplyFromSession(session);

  session.lastAssistantReply = replyText;
  if (isUsableReply(replyText)) {
    pushRecentTurn(session, "assistant", replyText);
  }

  logDecision(callSid, "Workflow ready for confirmation", {
    tenantId: session.tenantId,
    clusterId: session.clusterId,
    businessType: session.businessType,
    workflowStatus: session.workflowStatus,
    slots: session.slots,
    replyText,
  });

  return {
    shouldSpeak: true,
    replyText,
    replyType: "confirmation",
    workflow: session.workflow,
    intent: session.active_intent,
    slots: session.slots,
    lastAskedSlot: session.lastAskedSlot,
    workflowStatus: session.workflowStatus,
    tenantId: session.tenantId,
    clusterId: session.clusterId,
  };
}

  let replyText;
  try {
    replyText = await composeReply({
      clusterSchema,
      session,
      workflowState: {
        ...workflowState,
        slots: session.slots,
      },
      utterance,
    });
  } catch (err) {
    logError(callSid, "Workflow reply composition failed", {
      error: err.message,
      clusterId: session.clusterId,
      tenantId: session.tenantId,
      intent: workflowState.intent || null,
    });

    replyText = "";
  }

  replyText = normalizeText(replyText);

  if (replyText.length > 120) {
    replyText = replyText.slice(0, 120);
  }

  if (!isUsableReply(replyText)) {
    replyText = buildSafeFallbackReply(session);

    logDecision(callSid, "Workflow reply replaced with fallback", {
      tenantId: session.tenantId,
      businessId: session.businessId,
      clusterId: session.clusterId,
      intent: session.active_intent,
      workflowStatus: session.workflowStatus,
      slots: session.slots,
      nextMissingSlot: session.lastAskedSlot,
      fallbackReplyText: replyText,
    });
  }

 if (session.confirmationBlocked && !canConfirmNow(session.businessType, session.slots)) {
  const nextMissingSlot = getNextMissingRequiredSlot(
    session.businessType || "generic",
    session.slots || {}
  );

  if (nextMissingSlot) {
    const slotPrompt = getPremiumNextSlotQuestion(
      session.businessType || "generic",
      nextMissingSlot,
      session
    );

    const shouldAddBookingAck =
      !session.lastAssistantReply &&
      (session.active_intent === "reservation" || session.workflow === "reservation");

    if (shouldAddBookingAck) {
      replyText = `${getPremiumAcknowledgement("booking", session)} ${slotPrompt}`;
    } else {
      replyText = slotPrompt;
    }

    session.lastAskedSlot = nextMissingSlot;
  }
}

  if (replyText === normalizeText(session.lastAssistantReply)) {
    if (session.lastAskedSlot) {
      replyText = getPremiumNextSlotQuestion(
        session.businessType || "generic",
        session.lastAskedSlot,
        session
      );
    } else if (workflowState.confirmationPending) {
      replyText = `${getPremiumPrompt("confirmOnce", session) || "Just to confirm —"} ${buildConfirmationReplyFromSession(session).replace(/^(Just to confirm —|Let me confirm that —|Just confirming —)\s*/i, "")}`;
    } else {
      replyText = getPremiumRecoveryLine("generic", session);
    }
  }

  session.lastAssistantReply = replyText;

  if (isUsableReply(replyText)) {
    pushRecentTurn(session, "assistant", replyText);
  }

  logDecision(callSid, "AI workflow turn processed", {
    tenantId: session.tenantId,
    businessId: session.businessId,
    clusterId: session.clusterId,
    intent: session.active_intent,
    workflowStatus: session.workflowStatus,
    slots: session.slots,
    nextMissingSlot: session.lastAskedSlot,
    deterministicSlots,
    holisticSlots,
    conversationTranscript: buildConversationTranscript(session),
  });

  return {
    shouldSpeak: true,
    replyText,
    replyType: "ai",
    workflow: session.workflow,
    intent: session.active_intent,
    slots: session.slots,
    lastAskedSlot: session.lastAskedSlot,
    workflowStatus: session.workflowStatus,
    tenantId: session.tenantId,
    clusterId: session.clusterId,
  };
}

module.exports = {
  handleCallStarted,
  handleGreeting,
  handleTranscriptPartial,
  handleTranscriptFinal,
  handleProcessingResult,
  handleSpeak,
  handleSpeechComplete,
  handleCallEnded,
  handleCallerTurn,
};