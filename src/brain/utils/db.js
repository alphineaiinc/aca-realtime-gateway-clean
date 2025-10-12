// =============================================
// src/brain/utils/db.js
// Centralized DB connector for ACA Brain
// =============================================
const { Pool } = require("pg");
const path = require("path");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
});

pool.on("connect", () => console.log("✅ Connected to PostgreSQL"));

async function query(text, params) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  console.log("⏱ DB Query", { text, duration, rows: res.rowCount });
  return res;
}

module.exports = { pool, query };
