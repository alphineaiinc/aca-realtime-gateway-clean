// src/monitor/resilienceMetrics.js
const metrics = {
  watchdogRestarts: 0,
  httpRetries: 0,
  lastRecoveryAt: null,
  lastCrashAt: null,
};

function inc(field) {
  if (metrics[field] === undefined) return;
  metrics[field]++;
}

function set(field, value) {
  metrics[field] = value;
}

function observeHttpRetry() {
  inc("httpRetries");
}

function markCrash() {
  metrics.lastCrashAt = new Date().toISOString();
}

function markRecovery() {
  metrics.lastRecoveryAt = new Date().toISOString();
}

function getMetricsText() {
  return [
    "# HELP aca_watchdog_restarts total restarts performed by watchdog",
    "# TYPE aca_watchdog_restarts counter",
    `aca_watchdog_restarts ${metrics.watchdogRestarts}`,
    "# HELP aca_http_retries total http retries due to transient failures",
    "# TYPE aca_http_retries counter",
    `aca_http_retries ${metrics.httpRetries}`,
    "# HELP aca_last_crash timestamp of last crash (unix seconds)",
    "# TYPE aca_last_crash gauge",
    `aca_last_crash ${metrics.lastCrashAt ? Date.parse(metrics.lastCrashAt)/1000 : 0}`,
    "# HELP aca_last_recovery timestamp of last recovery (unix seconds)",
    "# TYPE aca_last_recovery gauge",
    `aca_last_recovery ${metrics.lastRecoveryAt ? Date.parse(metrics.lastRecoveryAt)/1000 : 0}`,
  ].join("\n");
}

module.exports = {
  metrics,
  inc,
  set,
  observeHttpRetry,
  markCrash,
  markRecovery,
  getMetricsText,
};
