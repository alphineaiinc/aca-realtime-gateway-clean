// ============================================================
// src/db/pool.js – Final stable for Heroku RDS cluster
// ============================================================

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../../../.env") });
const { Pool } = require("pg");

// Use Heroku-provided environment vars
const connectionString = process.env.DATABASE_URL;

const pool = new Pool({
  connectionString,
  ssl: {
    require: true,
    rejectUnauthorized: false,
  },
  max: 10,
  idleTimeoutMillis: 30000,
});

pool.on("connect", () => {
  console.log("🌐 Connected to Postgres successfully");
});

pool.on("error", (err) => {
  console.error("❌ Unexpected PG Pool error:", err);
  process.exit(-1);
});

module.exports = pool;
