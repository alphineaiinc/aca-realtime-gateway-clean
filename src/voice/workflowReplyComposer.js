"use strict";

const OpenAI = require("openai");

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
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

async function composeReply({
  clusterSchema,
  session,
  workflowState,
  utterance
}) {
  const {
    intent,
    slots,
    nextMissingSlot,
    workflowStatus,
    confirmationSlots,
    confirmationPending
  } = workflowState;

  const response = await client.chat.completions.create({
    model: MODEL,
    temperature: 0.3,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: [
          "You are a human-like voice assistant handling a live phone call.",
          "",
          "STRICT RULES:",
          "- Speak naturally like a human (not robotic).",
          "- Keep responses SHORT (max 18–22 words).",
          "- Ask ONLY ONE question at a time.",
          "- NEVER repeat the same question.",
          "- NEVER say 'how can I help you today' after conversation started.",
          "- NEVER list services unless explicitly asked.",
          "- If a slot was just answered, acknowledge briefly then move forward.",
          "",
          "WORKFLOW RULES:",
          "- If next_missing_slot exists → ask ONLY for that.",
          "- If all required slots are filled → confirm details clearly.",
          "- If confirming → ask for confirmation (yes/no).",
          "- If no intent → ask a natural clarifying question.",
          "",
          "OUTPUT:",
          "Return ONLY JSON: { \"reply_text\": \"...\" }"
        ].join("\n")
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
          constraints: {
            max_words: 22,
            single_question: true,
            no_repetition: true
          }
        })
      }
    ]
  });

  const raw = response?.choices?.[0]?.message?.content || "";
  const parsed = safeParseJSON(raw);

  let replyText = parsed?.reply_text || raw;

  // 🔒 HARD SAFETY FALLBACKS

  if (!replyText || typeof replyText !== "string") {
    replyText = "Sorry — could you repeat that?";
  }

  // Prevent repetition of last question
     const lastReply =
    typeof session?.lastAssistantReply === "string"
      ? session.lastAssistantReply.trim().toLowerCase()
      : "";

  if (lastReply && replyText.trim().toLowerCase() === lastReply) {
    if (nextMissingSlot) {
      const spokenSlot = String(nextMissingSlot).replace(/_/g, " ");
      replyText = `Just to confirm, what is the ${spokenSlot}?`;
    } else if (confirmationPending) {
      replyText = "Could you confirm those details for me?";
    } else {
      replyText = "Sorry, could you say that once more?";
    }
  }

  return replyText.trim();
}

module.exports = {
  composeReply
};