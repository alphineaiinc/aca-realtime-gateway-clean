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
  COMPLETED: "completed",
  FAILED: "failed",
  ENDED: "ended",
};

const ALLOWED_TRANSITIONS = {
  idle: ["greeting", "ended", "failed"],
  greeting: ["listening", "ended", "failed"],
  listening: ["awaiting_end_of_turn", "ended", "failed"],
  awaiting_end_of_turn: ["processing", "listening", "ended", "failed"],
  processing: ["ready_to_speak", "task_in_progress", "completed", "ended", "failed"],
  task_in_progress: ["ready_to_speak", "ended", "failed"],
  ready_to_speak: ["speaking", "ended", "failed"],
  speaking: ["awaiting_input", "ended", "failed"],
  awaiting_input: ["listening", "ended", "failed"],
  completed: ["ended"],
  failed: ["ended"],
  ended: [],
};

function canTransition(from, to) {
  return ALLOWED_TRANSITIONS[from]?.includes(to);
}

function transition(session, to, reason = "unknown") {
  const from = session.state;

  if (!canTransition(from, to)) {
    console.warn(`⚠️ Invalid transition: ${from} → ${to} | reason=${reason}`);
    return false;
  }

  session.state = to;
  session.updatedAt = Date.now();

  console.log(
    `🔁 [STATE] ${session.callSid} | ${from} → ${to} | reason=${reason}`
  );

  return true;
}

module.exports = {
  STATES,
  transition,
  canTransition,
};