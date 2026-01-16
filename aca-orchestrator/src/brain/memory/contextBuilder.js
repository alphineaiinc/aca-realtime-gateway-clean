"use strict";

const { summarizeTurns } = require("./summarizer");

/**
 * Build a compact memory-aware context object to pass into retriever.
 * We do not dump everything; we keep summary + last N turns.
 */
function buildContext(state, opts = {}) {
  const recentTurns = opts.recentTurns ?? 8;     // last 8 turns verbatim
  const summarizeBeyond = opts.summarizeBeyond ?? 10; // summarize older turns if > 10

  const turns = Array.isArray(state.turns) ? state.turns : [];
  let summary = state.summary || "";

  // if too many turns and no summary yet, create one from older turns
  if (turns.length > summarizeBeyond) {
    const older = turns.slice(0, turns.length - recentTurns);
    if (older.length > 0) {
      const auto = summarizeTurns(older);
      // merge gently
      if (auto) summary = summary ? (summary + "\n" + auto) : auto;
    }
  }

  const recent = turns.slice(-1 * recentTurns).map(t => ({
    role: t.role,
    text: t.text,
    intentTag: t.intentTag || "",
  }));

  return {
    summary: summary || "",
    activeIntent: state.activeIntent || "",
    recentTurns: recent,
  };
}

module.exports = { buildContext };
