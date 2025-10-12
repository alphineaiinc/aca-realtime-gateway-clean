// ============================================================
// src/db/pool.js
// Standardized ACA DB Connection Pool
// (Supports both PG_* and DB_* for backward compatibility)
// ============================================================

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../../../.env") });
const { Pool } = require("pg");

// Resolve either DB_* or PG_* variable names
const host = process.env.DB_HOST || process.env.PGHOST;
const user = process.env.DB_USER || process.env.PGUSER;
const password = process.env.DB_PASSWORD || process.env.PGPASSWORD;
const database = process.env.DB_NAME || process.env.PGDATABASE;
const port = process.env.DB_PORT || process.env.PGPORT || 5432;

if (!password) {
  console.error("❌ Missing database password. Check your .env file (DB_PASSWORD or PGPASSWORD).");
  process.exit(1);
}

const pool = new Pool({
  host,
  user,
  password,
  database,
  port,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: true } : false,
  max: 10,
  idleTimeoutMillis: 30000,
});

pool.on("error", (err) => {
  console.error("Unexpected PG Pool error:", err);
  process.exit(-1);
});

module.exports = pool;
