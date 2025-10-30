// ============================================================
// src/db/pool.js — Final Render + Local PostgreSQL connection (adaptive SSL)
// ============================================================
const path = require("path");
const { Pool } = require("pg");

// --- Confirm correct .env path ---
console.log("🧩 pool.js is running from:", __dirname);
const dotenvPath = path.resolve(__dirname, "../../.env"); // ✅ points to orchestrator-level .env
console.log("🧩 Loading .env from:", dotenvPath);

// --- Load environment variables ---
require("dotenv").config({ path: dotenvPath });

// --- Base connection URL ---
let baseUrl = process.env.DATABASE_URL || "";
console.log("🔍 Using DATABASE_URL =", baseUrl);

// --- Detect environment type ---
const isRender =
  baseUrl.includes("neon.tech") ||
  baseUrl.includes("render.com") ||
  baseUrl.includes("sslmode=require");

// --- Append sslmode if missing for cloud ---
if (isRender && !baseUrl.includes("sslmode")) {
  baseUrl += "?sslmode=require";
}

// --- Pool configuration ---
const poolConfig = {
  connectionString: baseUrl,
  ssl: isRender
    ? {
        require: true,
        rejectUnauthorized: false, // ✅ required for managed Neon/Render SSL
      }
    : false, // ✅ disables SSL for localhost
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
};

// --- Create pool ---
const pool = new Pool(poolConfig);

// --- Verify connection on startup ---
(async () => {
  try {
    const client = await pool.connect();
    const result = await client.query(
      "SELECT current_user, current_database(), version();"
    );
    console.log(
      `🌐 Connected successfully to ${
        isRender ? "Render/Neon (SSL verified)" : "Local PostgreSQL (non-SSL)"
      }`
    );
    console.log("📊 DB Info:", result.rows[0]);
    client.release();
  } catch (err) {
    console.error("❌ Startup connection failed:", err.message);
  }
})();

// --- Handle unexpected pool errors ---
pool.on("error", (err) => {
  console.error("❌ Unexpected PG Pool error:", err);
  process.exit(-1);
});

module.exports = pool;
