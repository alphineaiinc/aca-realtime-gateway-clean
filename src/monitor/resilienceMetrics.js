/**
 * src/monitor/resilienceMetrics.js
 * Safe no-op metrics module (Render-safe).
 * Prevents startup crashes if metrics are referenced but not fully implemented yet.
 * Security: does not log secrets or request bodies.
 */

function observeHttpRetry(_meta) {
  // no-op
}

function getMetricsText() {
  // Prometheus text format placeholder (valid, empty)
  return "";
}

module.exports = {
  observeHttpRetry,
  getMetricsText,
};