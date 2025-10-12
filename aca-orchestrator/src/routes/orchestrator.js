// ==========================================
// aca-orchestrator/src/routes/orchestrator.js
// Root router for Orchestrator APIs (Story 3.2)
// ==========================================
const express = require("express");
const router = express.Router();

const orderRoutes = require("./orderRoutes");

// Health check
router.get("/health", (req, res) => {
  res.json({
    ok: true,
    feature: "order-flow",
    enabled: true,
  });
});

// Mount all order routes
router.use("/order", orderRoutes);

module.exports = router;
