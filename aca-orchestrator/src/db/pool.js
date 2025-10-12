// ============================================================
// src/db/pool.js — Final stable Heroku Postgres connection
// ============================================================
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../../../.env") });
const { Pool } = require("pg");

let connectionString = process.env.DATABASE_URL;

// Force sslmode=require for Heroku RDS clusters
if (connectionString && !connectionString.includes("sslmode")) {
  connectionString += connectionString.includes("?")
    ? "&sslmode=require"
    : "?sslmode=require";
}

const pool = new Pool({
  connectionString,
  ssl: { require: true, rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
});

pool.on("connect", () => console.log("🌐 Connected to Postgres successfully"));
pool.on("error", (err) => {
  console.error("❌ Unexpected PG Pool error:", err);
  process.exit(-1);
});

module.exports = pool;
