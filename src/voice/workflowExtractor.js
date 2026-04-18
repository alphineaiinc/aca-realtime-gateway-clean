// src/voice/workflowExtractor.js
"use strict";

const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

let OpenAI = null;
try {
  OpenAI = require("openai");
} catch (err) {
  console.warn("[workflowExtractor] openai package not found");
}

const DEFAULT_MODEL =
  process.env.OPENAI_REALTIME_TEXT_MODEL ||
  process.env.OPENAI_MODEL ||
  "gpt-4o-mini";

let client = null;
function getOpenAIClient() {
  if (client) return client;
  if (!OpenAI) {
    throw new Error("OpenAI package is not available");
  }
  client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
  return client;
}

function safeObject(value, fallback = {}) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : fallback;
}

function safeArray(value, fallback = []) {
  return Array.isArray(value) ? value : fallback;
}

function normalizeText(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function buildIntentCatalog(clusterSchema = {}) {
  return safeArray(clusterSchema.intents).map((intentDef) => ({
    intent: intentDef.intent,
    description: intentDef.description || "",
    required_slots: safeArray(intentDef.required_slots),
    optional_slots: safeArray(intentDef.optional_slots),
    confirmation_slots: safeArray(intentDef.confirmation_slots),
  }));
}

function buildConversationTranscript(recentTurns = []) {
  return safeArray(recentTurns)
    .slice(-10)
    .map((turn) => `${turn.role}: ${normalizeText(turn.text)}`)
    .filter(Boolean)
    .join("\n");
}

function buildExtractorPrompt({
  clusterId,
  clusterSchema,
  session,
  utterance,
  recentTurns,
}) {
  const activeIntent = session?.active_intent || null;
  const currentSlots = safeObject(session?.slots);
  const lastAskedSlot = session?.lastAskedSlot || null;
  const conversationTranscript = buildConversationTranscript(recentTurns);

  return [
    {
      role: "system",
      content:
        "You are an extraction engine for a live voice workflow. Return JSON only. No markdown. No explanation.",
    },
    {
      role: "system",
      content: [
        "Rules:",
        "1. Only use intents allowed by the provided cluster schema.",
        "2. Only extract slots defined by the provided schema or the chosen intent.",
        "3. Use the full recent conversation, not just the latest utterance.",
        "4. Prefer preserving already-known slots unless the caller clearly corrects them.",
        "5. Normalize likely voice/STT mistakes when strongly supported by context.",
        "6. Treat spoken dates and times naturally, such as 'tomorrow', 'April 21st', '21st of April', '7 o clock', '7 in the evening'.",
        "7. If the latest utterance is noisy but the conversation strongly implies a slot value, you may still extract it.",
        "8. If session already has an active intent and the utterance is consistent with it, continue that intent.",
        "9. If the caller is answering the requested slot, set answered_requested_slot = true.",
        "10. Return valid compact JSON only.",
      ].join(" "),
    },
    {
      role: "user",
      content: JSON.stringify({
        task: "Extract cluster-aware intent and slot updates from the latest caller utterance using full conversation context.",
        cluster_id: clusterId,
        allowed_intents: buildIntentCatalog(clusterSchema),
        slot_definitions: safeObject(clusterSchema.slot_definitions),
        session: {
          active_intent: activeIntent,
          slots: currentSlots,
          last_asked_slot: lastAskedSlot,
          last_assistant_reply: session?.lastAssistantReply || null,
          last_caller_text: session?.lastCallerText || null,
        },
        recent_turns: safeArray(recentTurns).slice(-10),
        conversation_transcript: conversationTranscript,
        latest_utterance: normalizeText(utterance),
        output_schema: {
          intent: "string|null",
          intent_confidence: "number_0_to_1",
          intent_changed: "boolean",
          slot_updates: "object",
          slot_corrections: "object",
          answered_requested_slot: "boolean",
          next_recommended_slot: "string|null",
          caller_goal_summary: "string",
          handoff_required: "boolean",
          safety_flags: "string[]",
          notes: "string[]",
        },
      }),
    },
  ];
}

function tryParseJson(text) {
  if (!text || typeof text !== "string") return null;

  try {
    return JSON.parse(text);
  } catch (err) {
    const firstBrace = text.indexOf("{");
    const lastBrace = text.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      const sliced = text.slice(firstBrace, lastBrace + 1);
      try {
        return JSON.parse(sliced);
      } catch (innerErr) {
        return null;
      }
    }
    return null;
  }
}

function normalizeExtractionResult(raw, session = {}) {
  const currentIntent = session?.active_intent || null;

  return {
    intent: raw?.intent || currentIntent || null,
    intent_confidence:
      typeof raw?.intent_confidence === "number" ? raw.intent_confidence : 0,
    intent_changed: Boolean(raw?.intent_changed),
    slot_updates: safeObject(raw?.slot_updates),
    slot_corrections: safeObject(raw?.slot_corrections),
    answered_requested_slot: Boolean(raw?.answered_requested_slot),
    next_recommended_slot: raw?.next_recommended_slot || null,
    caller_goal_summary: raw?.caller_goal_summary || "",
    handoff_required: Boolean(raw?.handoff_required),
    safety_flags: safeArray(raw?.safety_flags),
    notes: safeArray(raw?.notes),
  };
}

async function extractWorkflowTurn({
  clusterId,
  clusterSchema,
  session,
  utterance,
  recentTurns = [],
}) {
  if (!utterance || !String(utterance).trim()) {
    return normalizeExtractionResult({}, session);
  }

  const openai = getOpenAIClient();
  const messages = buildExtractorPrompt({
    clusterId,
    clusterSchema,
    session,
    utterance: String(utterance).trim(),
    recentTurns,
  });

  const response = await openai.chat.completions.create({
    model: DEFAULT_MODEL,
    temperature: 0.1,
    response_format: { type: "json_object" },
    messages,
  });

  const text = response?.choices?.[0]?.message?.content || "{}";
  const parsed = tryParseJson(text) || {};
  return normalizeExtractionResult(parsed, session);
}

module.exports = {
  buildIntentCatalog,
  buildExtractorPrompt,
  extractWorkflowTurn,
  normalizeExtractionResult,
};