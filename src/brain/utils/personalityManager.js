const { Pool } = require("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function getPersonality(business_id) {
  const res = await pool.query(
    "SELECT * FROM personalities WHERE business_id=$1 LIMIT 1",
    [business_id]
  );
  if (res.rows.length) return res.rows[0];

  const insert = await pool.query(
    "INSERT INTO personalities (business_id) VALUES ($1) RETURNING *",
    [business_id]
  );
  return insert.rows[0];
}

module.exports = { getPersonality };
