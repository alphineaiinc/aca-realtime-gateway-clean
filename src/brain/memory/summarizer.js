"use strict";

/**
 * V1 summarizer (non-LLM) for safety + speed:
 * - extracts bullet-like summary from older turns
 * - keeps it neutral, task-focused, minimal
 *
 * Later we can add an optional LLM summarizer behind a flag.
 */

function summarizeTurns(turns) {
  // turns: array of {role, text}
  // keep first ~6 older items as bullets, heavily trimmed
  const items = [];
  for (const t of turns) {
    const role = t.role === "assistant" ? "ACA" : "User";
    const txt = String(t.text || "").replace(/\s+/g, " ").trim();
    if (!txt) continue;

    const short = txt.length > 180 ? txt.slice(0, 180) + "" : txt;
    items.push(`- ${role}: ${short}`);
    if (items.length >= 8) break;
  }
  return items.join("\n");
}

module.exports = { summarizeTurns };
