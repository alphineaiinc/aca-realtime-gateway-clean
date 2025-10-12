// ========================================================
// src/brain/db/order.js — Story 3.3
// ========================================================
const pool = require('./pool');

async function saveOrder(order) {
  const client = await pool.connect();
  try {
    const res = await client.query(
      `INSERT INTO orders (business_id, items, status, source, created_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [order.business_id, JSON.stringify(order.items), order.status, order.source, order.created_at]
    );
    return res.rows[0];
  } finally {
    client.release();
  }
}

module.exports = { saveOrder };
