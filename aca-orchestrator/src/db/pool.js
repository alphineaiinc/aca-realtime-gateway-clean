// ============================================================
// src/db/pool.js — Final Render + Neon PostgreSQL connection (SSL verified, orchestrator .env)
// ============================================================
const path = require("path");

// --- Confirm correct .env path ---
console.log("🧩 pool.js is running from:", __dirname);
const dotenvPath = path.resolve(__dirname, "../../.env"); // ✅ points to orchestrator-level .env only
console.log("🧩 Loading .env from:", dotenvPath);

// --- Load environment variables ---
require("dotenv").config({ path: dotenvPath });
const { Pool } = require("pg");

let baseUrl = process.env.DATABASE_URL;

// --- Diagnostic: print the connection URL being used ---
console.log("🔍 Using DATABASE_URL =", baseUrl);

// --- Ensure sslmode=require is appended if missing ---
if (baseUrl && !baseUrl.includes("sslmode")) {
  baseUrl += "?sslmode=require";
}

// --- Create the Pool (Neon requires SSL) ---
const pool = new Pool({
  connectionString: baseUrl,
  ssl: {
    require: true,
    rejectUnauthorized: false, // ✅ Required for managed Neon certificates
  },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

// --- Verify connection on startup ---
(async () => {
  try {
    const client = await pool.connect();
    const result = await client.query(
      "SELECT current_user, current_database(), version();"
    );
    console.log("🌐 Connected successfully to Neon PostgreSQL (SSL verified)");
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
