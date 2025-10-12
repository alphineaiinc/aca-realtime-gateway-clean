// ==========================================
// aca-orchestrator/src/routes/orderRoutes.js
// Story 3.2 — Order CRUD Routes
// ==========================================
const express = require("express");
const router = express.Router();
const orderController = require("../brain/controllers/orderController");

// Create a new order
router.post("/", orderController.create);

// List all orders
router.get("/", orderController.list);

// Get a specific order
router.get("/:id", orderController.get);

// Update an order
router.put("/:id", orderController.update);

// Delete an order
router.delete("/:id", orderController.remove);

module.exports = router;
