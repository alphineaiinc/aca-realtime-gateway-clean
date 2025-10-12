// Bootstrap wrapper to attach Epic-2 features while preserving your existing server.js.
const http = require('http');
const express = require('express');

const attachBrain = require('./attach-brain');
const config = require('./config');
const { createLogger } = require('./src/brain/utils/logger');
const { securityStack } = require('./src/brain/middleware/security');

const logger = createLogger({
  level: (process.env.LOG_LEVEL || 'info'),
  redactSensitive: config.logging.redactSensitive
});

let app;
try {
  // If your existing server.js exports an Express app, reuse it.
  const legacy = require('./server');
  app = legacy.app || legacy || express();
} catch {
  // Fallback (if server.js doesn't export an app or isn't present)
  app = express();
}

// Global security headers & rate limiting
securityStack(app);

// Attach Epic-2 routes
attachBrain(app);

// Start (uses APP_PORT/.env and enforces WS_SHARED_SECRET presence via config)
const port = config.port;
http.createServer(app).listen(port, () => {
  logger.info(`Epic-2 bootstrap listening on :${port} (env=${config.env})`);
});
