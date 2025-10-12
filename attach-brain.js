// Attach Epic-2 routes without altering core realtime flow.
const config = require('./config');
const { createLogger } = require('./src/brain/utils/logger');
const brainRoutes = require('./src/brain/routes');

const logger = createLogger({
  level: (process.env.LOG_LEVEL || 'info'),
  redactSensitive: config.logging.redactSensitive
});

module.exports = function attachBrain(app) {
  try {
    app.use('/brain', brainRoutes);
    logger.info('Brain routes attached (flag-controlled).');
  } catch (e) {
    logger.error('Failed to attach brain routes', e.message);
  }
};
