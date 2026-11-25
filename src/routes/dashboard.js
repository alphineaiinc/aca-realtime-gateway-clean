// ================================
// src/routes/dashboard.js
// Story 2.13 — AI Brain Lifecycle + Confidence Dashboard UI
// Builds on Story 2.11 — adds Brain diagnostics panel
// ================================
const express = require("express");
const fs = require("fs");
const path = require("path");
const axios = require("axios");

const router = express.Router();
const { rateLimit } = require("express-rate-limit");
const dashboardIngress = rateLimit({windowMs:60000,limit:30,passOnStoreError:false});
const { createPostgresRateLimiter } = require("../middleware/postgresRateLimit");
const dashboardLimit = createPostgresRateLimiter({pool:require("../db/pool"),scope:"internal-dashboard",max:30,publicGlobal:true});
// Disabled until a trusted operator authentication boundary is integrated.
function requireVerifiedOperator(req,res,next) {
  return res.status(403).json({error:"Verified operator access required"});
}
const LOG_PATH = path.join(__dirname, "../logs/response_tuning.log");

// ----------------------------------------------------
// Serve static dashboard UI
// ----------------------------------------------------
router.get("/", dashboardIngress, dashboardLimit, (req, res) => {
  res.sendFile(path.join(__dirname, "../../public/dashboard/index.html"));
});

// ----------------------------------------------------
// API endpoint — serve parsed adaptive-response log data
// ----------------------------------------------------
router.get("/data", dashboardIngress, requireVerifiedOperator, dashboardLimit, (req, res) => {
  try {
    res.set("Cache-Control", "no-store");

    if (!fs.existsSync(LOG_PATH)) {
      return res.json({ entries: [] });
    }

    const content = fs.readFileSync(LOG_PATH, "utf8");
    const lines = content.trim().split("\n").filter(Boolean).slice(-200);

    const entries = lines
      .map((line) => {
        try {
          const match = line.match(/\[(.*?)\]\s\[(.*?)\]\s(.+)/);
          if (!match) return null;
          return {
            timestamp: match[1],
            level: match[2],
            message: match[3],
          };
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));

    res.json({ entries });
  } catch (err) {
    console.error("Dashboard API failed");
    res.status(500).json({ error: "Dashboard unavailable" });
  }
});

// ----------------------------------------------------
// NEW — /brain-status endpoint
// Fetches diagnostics from /brain/diagnostics
// so UI can display Brain status, uptime, memory, etc.
// ----------------------------------------------------
router.get("/brain-status", dashboardIngress, requireVerifiedOperator, dashboardLimit, async (req, res) => {
  try {
    res.set("Cache-Control", "no-store");

    const port = process.env.PORT || "8080";
    const url = `http://127.0.0.1:${port}/brain/diagnostics`;

    const response = await axios.get(url, {
      timeout: 3000,
    });

    const diag = response.data || {};
    return res.json({
      ok: true,
      brain_enabled: diag.brain_enabled ?? false,
      uptime_sec: diag.uptime_sec ?? 0,
      memory_mb: diag.memory_mb ?? 0,
      query_count: diag.query_count ?? 0,
    });
  } catch (err) {
    console.error("Brain diagnostics unavailable");
    return res.status(500).json({
      ok: false,
      error: "Unable to fetch brain diagnostics",
    });
  }
});

module.exports = router;
