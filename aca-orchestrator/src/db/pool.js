// ============================================================
// src/db/pool.js — Final stable Heroku Postgres connection
// ============================================================
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../../../.env") });
const { Pool } = require("pg");

const connectionString = process.env.DATABASE_URL + "?sslmode=require";

const pool = new Pool({
  connectionString,
  ssl: { require: true, rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

(async () => {
  try {
    const client = await pool.connect();
    console.log("🌐 Connected to Postgres successfully (startup test)");
    client.release();
  } catch (err) {
    console.error("❌ Startup connection failed:", err.message);
  }
})();

pool.on("error", (err) => {
  console.error("❌ Unexpected PG Pool error:", err);
  process.exit(-1);
});

module.exports = pool;
