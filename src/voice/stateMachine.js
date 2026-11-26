const console = require("./voiceLogger").operationalConsole;
// src/voice/stateMachine.js

const STATES = {
  IDLE: "idle",
  GREETING: "greeting",
  LISTENING: "listening",
  AWAITING_END_OF_TURN: "awaiting_end_of_turn",
  PROCESSING: "processing",
  READY_TO_SPEAK: "ready_to_speak",
  SPEAKING: "speaking",
  AWAITING_INPUT: "awaiting_input",
  TASK_IN_PROGRESS: "task_in_progress",
  READY_FOR_CONFIRMATION: "ready_for_confirmation",
  COMPLETED: "completed",
  FAILED: "failed",
  ENDED: "ended",
};

const ALLOWED_TRANSITIONS = {
  idle: ["greeting", "ended", "failed"],

  greeting: ["ready_to_speak", "listening", "ended", "failed"],

  listening: [
    "ready_to_speak",
    "awaiting_end_of_turn",
    "processing",
    "ended",
    "failed",
  ],

  awaiting_end_of_turn: [
    "ready_to_speak",
    "processing",
    "listening",
    "ended",
    "failed",
  ],

  processing: [
    "ready_to_speak",
    "task_in_progress",
    "ready_for_confirmation",
    "completed",
    "listening",
    "ended",
    "failed",
  ],

  task_in_progress: [
    "processing",
    "ready_to_speak",
    "ready_for_confirmation",
    "completed",
    "ended",
    "failed",
  ],

  ready_for_confirmation: [
    "ready_to_speak",
    "processing",
    "completed",
    "ended",
    "failed",
  ],

  ready_to_speak: ["speaking", "listening", "ended", "failed"],

  speaking: [
    "awaiting_input",
    "listening",
    "ended",
    "failed",
  ],

  awaiting_input: [
    "ready_to_speak",
    "awaiting_end_of_turn",
    "processing",
    "listening",
    "ended",
    "failed",
  ],

  completed: ["ended"],

  failed: ["ended"],

  ended: [],
};

function canTransition(from, to) {
  return Boolean(ALLOWED_TRANSITIONS[from]?.includes(to));
}

function transition(session, to, reason = "unknown") {
  if (!session || typeof session !== "object") {
    console.warn("STATE_REJECTED");
    return false;
  }

  const from = session.state || STATES.IDLE;

  if (!canTransition(from, to)) {
    console.warn("STATE_REJECTED", { previousState: from, state: to, accepted: false });
    return false;
  }

  session.state = to;
  session.updatedAt = Date.now();

  console.log("STATE_TRANSITION", { previousState: from, state: to, accepted: true });

  return true;
}

module.exports = {
  STATES,
  transition,
  canTransition,
};