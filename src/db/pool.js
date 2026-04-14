// ============================================================
// src/db/pool.js — Final Render + Local PostgreSQL connection (adaptive SSL)
// ============================================================
const path = require("path");
const { Pool } = require("pg");

// --- Confirm correct .env path ---
console.log("🧩 pool.js is running from:", __dirname);
const dotenvPath = path.resolve(__dirname, "../../.env");
console.log("🧩 Loading .env from:", dotenvPath);

// --- Load environment variables ---
require("dotenv").config({ path: dotenvPath });

// --- Helpers ---
function sanitizeEnvValue(value) {
  return String(value || "")
    .trim()
    .replace(/^['"]+|['"]+$/g, "");
}

function redactDbUrl(raw) {
  if (!raw) return "(missing)";
  try {
    return raw.replace(/:\/\/([^:]+):([^@]+)@/, "://$1:***@");
  } catch {
    return "(unreadable)";
  }
}

// --- Base connection URL ---
let baseUrl = sanitizeEnvValue(process.env.DATABASE_URL);

console.log("🔍 Using DATABASE_URL =", redactDbUrl(baseUrl));

// --- Detect environment type ---
const isRender =
  baseUrl.includes("neon.tech") ||
  baseUrl.includes("render.com") ||
  baseUrl.includes("sslmode=require");

// --- Append sslmode if missing for cloud ---
if (isRender && baseUrl && !baseUrl.includes("sslmode")) {
  baseUrl += baseUrl.includes("?") ? "&sslmode=require" : "?sslmode=require";
}

// --- Validate URL early so startup log is clearer ---
try {
  if (!baseUrl) {
    throw new Error("DATABASE_URL is missing");
  }
  new URL(baseUrl);
} catch (err) {
  console.error("❌ DATABASE_URL validation failed:", err.message);
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