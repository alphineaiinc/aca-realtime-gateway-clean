// ================================
// config/flags.js
// Global Feature Flags
// ================================
const fs = require('fs');
const path = require('path');

const FLAGS_PATH = path.join(__dirname, 'flags_state.json');



// Load current state from file or default
let state = {};
try {
  if (fs.existsSync(FLAGS_PATH)) {
    state = JSON.parse(fs.readFileSync(FLAGS_PATH, 'utf8'));
  }
} catch (err) {
  console.error('⚠️ Failed to load flags_state.json:', err);
}

// Default flags
const flags = {
  AI_BRAIN_ENABLED: state.AI_BRAIN_ENABLED ?? false,
  REDACT_LOG_SENSITIVE: true
};

// Function to persist flag updates
function setFlag(key, value) {
  flags[key] = value;
  fs.mkdirSync(path.dirname(FLAGS_PATH), { recursive: true });
  fs.writeFileSync(FLAGS_PATH, JSON.stringify(flags, null, 2));
}

module.exports = { flags, setFlag };
