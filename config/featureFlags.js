// Centralized feature flags (OFF by default)
module.exports = {
  AI_BRAIN_ENABLED: process.env.AI_BRAIN_ENABLED === 'true',
  REDACT_LOG_SENSITIVE: (process.env.REDACT_LOG_SENSITIVE || 'true') === 'true',
  TRACE_REQUESTS: process.env.TRACE_REQUESTS === 'true',
  ENABLE_POLICY_ROUTER: process.env.ENABLE_POLICY_ROUTER === 'true',
  USE_OPENAI_REALTIME: (process.env.USE_OPENAI_REALTIME || 'false') === 'true',
  USE_GOOGLE_STT: (process.env.USE_GOOGLE_STT || 'true') === 'true',
  USE_ELEVENLABS_TTS: (process.env.USE_ELEVENLABS_TTS || 'true') === 'true'
};
