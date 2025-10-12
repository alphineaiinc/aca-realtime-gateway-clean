// ==========================================
// aca-orchestrator/src/brain/controllers/orderController.js
// ==========================================
const { createLogger } = require("../utils/logger");

const logger = createLogger({ level: "info" });

let orders = [];
let currentId = 1;

exports.create = (req, res) => {
  const order = { id: currentId++, ...req.body };
  orders.push(order);
  logger.info(`Order created: ${JSON.stringify(order)}`);
  res.json({ ok: true, order_id: order.id, message: "Order created successfully" });
};

exports.list = (req, res) => res.json({ orders });

exports.get = (req, res) => {
  const order = orders.find(o => o.id === parseInt(req.params.id));
  if (!order) return res.status(404).json({ error: "Order not found" });
  res.json(order);
};

exports.update = (req, res) => {
  const order = orders.find(o => o.id === parseInt(req.params.id));
  if (!order) return res.status(404).json({ error: "Order not found" });
  Object.assign(order, req.body);
  logger.info(`Order updated: ${JSON.stringify(order)}`);
  res.json({ ok: true, message: `Order ${order.id} updated successfully` });
};

exports.remove = (req, res) => {
  const index = orders.findIndex(o => o.id === parseInt(req.params.id));
  if (index === -1) return res.status(404).json({ error: "Order not found" });
  const deleted = orders.splice(index, 1);
  logger.info(`Order deleted: ${JSON.stringify(deleted[0])}`);
  res.json({ ok: true, message: `Order ${req.params.id} deleted successfully` });
};
