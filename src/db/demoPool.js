// src/db/demoPool.js
const { Pool } = require("pg");

let demoPool = null;

function getDemoPool() {
  if (demoPool) return demoPool;

  const url = process.env.DEMO_DB_URL;
  if (!url) throw new Error("DEMO_DB_URL not set (required for demo mode).");

  demoPool = new Pool({
    connectionString: url,
    ssl: { rejectUnauthorized: true },
    max: 3,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  });

  return demoPool;
}

module.exports = { getDemoPool };
