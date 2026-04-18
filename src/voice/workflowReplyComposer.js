// src/voice/workflowReplyComposer.js
"use strict";

const OpenAI = require("openai");

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

function safeParseJSON(text) {
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end !== -1) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function normalizeText(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function buildConversationTranscript(session) {
  return (session?.recentTurns || [])
    .slice(-10)
    .map((turn) => `${turn.role}: ${normalizeText(turn.text)}`)
    .filter(Boolean)
    .join("\n");
}

function buildRequestedSlotPrompt(nextMissingSlot) {
  const slot = String(nextMissingSlot || "").toLowerCase();

  if (!slot) {
    return "Ask a short natural clarifying question.";
  }

  if (slot.includes("date") || slot.includes("day")) {
    return "Ask only for the date.";
  }

  if (slot.includes("time")) {
    return "Ask only for the time.";
  }

  if (slot.includes("name")) {
    return "Ask only for the name.";
  }

  if (slot.includes("phone")) {
    return "Ask only for the contact number.";
  }

  if (slot.includes("email")) {
    return "Ask only for the email.";
  }

  if (
    slot.includes("type") ||
    slot.includes("reason") ||
    slot.includes("purpose") ||
    slot.includes("service")
  ) {
    return "Ask only what type of appointment or service is needed.";
  }

  return `Ask only for the ${slot.replace(/_/g, " ")}.`;
}

function buildConfirmationText(confirmationSlots = {}) {
  const parts = [];

  const slotEntries = Object.entries(confirmationSlots).filter(([, value]) =>
    normalizeText(value)
  );

  for (const [key, value] of slotEntries) {
    const slot = String(key).toLowerCase();

    if (slot.includes("name")) {
      parts.push(`name ${value}`);
    } else if (slot.includes("date") || slot.includes("day")) {
      parts.push(`date ${value}`);
    } else if (slot.includes("time")) {
      parts.push(`time ${value}`);
    } else if (slot.includes("phone")) {
      parts.push(`contact number ${value}`);
    } else if (
      slot.includes("type") ||
      slot.includes("reason") ||
      slot.includes("purpose") ||
      slot.includes("service")
    ) {
      parts.push(`service ${value}`);
    } else {
      parts.push(`${key.replace(/_/g, " ")} ${value}`);
    }
  }

  if (!parts.length) {
    return "Confirm the details briefly.";
  }

  return `Confirm these details briefly: ${parts.join(", ")}. Then ask yes or no.`;
}

async function composeReply({
  clusterSchema,
  session,
  workflowState,
  utterance,
}) {
  const {
    intent,
    slots,
    nextMissingSlot,
    workflowStatus,
    confirmationSlots,
    confirmationPending,
  } = workflowState;

  const conversationTranscript = buildConversationTranscript(session);
  const requestedSlotPrompt = buildRequestedSlotPrompt(nextMissingSlot);
  const confirmationPrompt = buildConfirmationText(confirmationSlots);

  const response = await client.chat.completions.create({
    model: MODEL,
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: [
          "You are a human-like voice assistant handling a live phone call.",
          "",
          "STRICT RULES:",
          "- Speak naturally and briefly.",
          "- Keep responses SHORT, max 16 words.",
          "- Ask ONLY ONE question at a time.",
          "- NEVER repeat the same question wording.",
          "- NEVER list services unless explicitly asked.",
          "- Use the conversation history and known slots.",
          "- If a slot was already captured clearly, DO NOT ask for it again.",
          "- If the latest utterance sounds noisy, rely on the overall conversation context.",
          "- If all required details are present, confirm them instead of asking a new slot.",
          "- If caller corrected a value, use the corrected value.",
          "",
          "WORKFLOW RULES:",
          "- If confirmation_pending is true, confirm the captured details.",
          "- Else if next_missing_slot exists, ask only for that missing slot.",
          "- Else if no intent, ask a short natural clarifying question.",
          "",
          "OUTPUT:",
          'Return ONLY JSON: { "reply_text": "..." }',
        ].join("\n"),
      },
      {
        role: "user",
        content: JSON.stringify({
          cluster_id: clusterSchema.cluster_id,
          intent,
          workflow_status: workflowStatus,
          slots,
          next_missing_slot: nextMissingSlot,
          confirmation_pending: confirmationPending,
          confirmation_slots: confirmationSlots,
          last_reply: session.lastAssistantReply || null,
          caller_utterance: utterance,
          conversation_transcript: conversationTranscript,
          requested_slot_prompt: requestedSlotPrompt,
          confirmation_prompt: confirmationPrompt,
          constraints: {
            max_words: 16,
            single_question: true,
            no_repetition: true,
          },
        }),
      },
    ],
  });

  const raw = response?.choices?.[0]?.message?.content || "";
  const parsed = safeParseJSON(raw);

  let replyText = parsed?.reply_text || raw;
  replyText = normalizeText(replyText);

  if (!replyText || typeof replyText !== "string") {
    replyText = "Sorry — could you repeat that?";
  }

  const lastReply =
    typeof session?.lastAssistantReply === "string"
      ? session.lastAssistantReply.trim().toLowerCase()
      : "";

  if (lastReply && replyText.trim().toLowerCase() === lastReply) {
    if (confirmationPending) {
      replyText = "Let me confirm those details. Is that correct?";
    } else if (nextMissingSlot) {
      const slotPrompt = buildRequestedSlotPrompt(nextMissingSlot);
      replyText = slotPrompt
        .replace(/^Ask only /i, "")
        .replace(/\.$/, "?")
        .replace(/^ask /i, "");
      replyText =
        replyText.charAt(0).toUpperCase() + replyText.slice(1);
    } else {
      replyText = "Sorry — could you say that once more?";
    }
  }

  return normalizeText(replyText);
}

module.exports = {
  composeReply,
};