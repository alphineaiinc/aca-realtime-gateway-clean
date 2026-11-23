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

console.log("Database connection configuration loaded");

// Remote connections require verified TLS; only loopback is exempt.
const parsed = new URL(baseUrl);
if (!["postgres:", "postgresql:"].includes(parsed.protocol) || !parsed.hostname) {
  throw new Error("Invalid PostgreSQL connection configuration");
}
const isRender = !["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname.toLowerCase());
for (const key of [...parsed.searchParams.keys()]) {
  if (["ssl", "sslmode", "sslcert", "sslkey", "sslrootcert", "host", "hostaddr"].includes(key.toLowerCase())) {
    parsed.searchParams.delete(key);
  }
}
baseUrl = parsed.toString();

// --- Pool configuration ---
const poolConfig = {
  connectionString: baseUrl,
  ssl: isRender
    ? {
        require: true,
        rejectUnauthorized: true, // Verify the server certificate and hostname
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
        isRender ? "Remote PostgreSQL (TLS certificate validation enabled)" : "Local PostgreSQL (non-SSL)"
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