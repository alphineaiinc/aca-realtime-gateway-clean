// src/brain/utils/safeAxios.js
// Lightweight axios wrapper with retry + exponential backoff + jitter
const { observeHttpRetry } = require("../../monitor/resilienceMetrics");

const axios = require("axios");

const DEFAULTS = {
  retries: 5,
  baseDelayMs: 250, // starting backoff
  maxDelayMs: 5000,
  timeoutMs: 20000, // per-request timeout
  retryOn: [429, 500, 502, 503, 504],
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function expBackoffDelay(attempt, baseDelay, maxDelay) {
  const exp = Math.min(maxDelay, baseDelay * Math.pow(2, attempt));
  const jitter = Math.floor(Math.random() * 100);
  return Math.min(exp + jitter, maxDelay);
}

async function requestWithRetry(config, opts = {}) {
  const { retries, baseDelayMs, maxDelayMs, timeoutMs, retryOn } = { ...DEFAULTS, ...opts };
  const instance = axios.create({ timeout: timeoutMs });

  let attempt = 0;
  while (true) {
    try {
      const res = await instance.request(config);
      return res;
    } catch (err) {
      const status = err?.response?.status;
      const retriable = retryOn.includes(status) || err.code === "ECONNRESET" || err.code === "ETIMEDOUT";
      if (attempt >= retries || !retriable) throw err;
      const delay = expBackoffDelay(attempt, baseDelayMs, maxDelayMs);
      attempt++;
      observeHttpRetry();
      await sleep(delay);
    }
  }
}

module.exports = { requestWithRetry };
