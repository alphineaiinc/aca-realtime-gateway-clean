// =============================================
// src/brain/models/order_model.js
// Story 3.2 — Order Schema & DB Actions
// =============================================
const { query } = require("../utils/db");

const OrderModel = {
  // Create a new order
  async createOrder(data) {
    const { business_id, customer_name, items, total_amount, status = "pending", source = "voice" } = data;
    const result = await query(
      `INSERT INTO orders (business_id, customer_name, items, total_amount, status, source)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [business_id, customer_name, JSON.stringify(items), total_amount, status, source]
    );
    return result.rows[0];
  },

  // Get one order
  async getOrderById(id) {
    const result = await query("SELECT * FROM orders WHERE id = $1", [id]);
    return result.rows[0] || null;
  },

  // Get all orders for a business
  async getOrdersByBusiness(business_id) {
    const result = await query(
      "SELECT * FROM orders WHERE business_id = $1 ORDER BY created_at DESC",
      [business_id]
    );
    return result.rows;
  },

  // Update order status
  async updateOrderStatus(id, status) {
    const result = await query(
      "UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *",
      [status, id]
    );
    return result.rows[0];
  },

  // Delete (for admin/testing)
  async deleteOrder(id) {
    await query("DELETE FROM orders WHERE id = $1", [id]);
    return { deleted: true };
  },
};

module.exports = OrderModel;
