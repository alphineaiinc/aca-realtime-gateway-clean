const helmet = require('helmet');

function basicRateLimit() {
  // In-memory limiter (fine for dev). Replace with shared store in prod.
  let hits = new Map();
  const WINDOW_MS = 60_000;
  const MAX = 120;

  return (req, res, next) => {
    const now = Date.now();
    const k = req.ip || 'unknown';
    const arr = (hits.get(k) || []).filter(t => now - t < WINDOW_MS);
    arr.push(now);
    hits.set(k, arr);
    if (arr.length > MAX) return res.status(429).json({ error: 'Too many requests' });
    next();
  };
}

function validateJson() {
  // Use as error handler after express.json()
  return (err, req, res, next) => {
    if (err && err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Invalid JSON' });
    }
    next(err);
  };
}

function securityStack(app) {
  app.use(helmet({ crossOriginOpenerPolicy: { policy: 'same-origin' } }));
  app.disable('x-powered-by');
  app.use(basicRateLimit());
}

module.exports = { securityStack, validateJson };
