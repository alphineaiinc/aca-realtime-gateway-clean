// src/routes/partnerLegal.js
const express = require("express");
const jwt = require("jsonwebtoken");
const { generatePartnerTermsPDF, recordAcceptance } = require("../brain/utils/legalManager");
const crypto = require("crypto");
const fs = require("fs");

const router = express.Router();

function authenticate(req, res, next) {
  try {
    const auth = req.headers.authorization || "";
    if (!auth.startsWith("Bearer ")) {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }

    const token = auth.slice(7).trim();
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }
}

// Download current Partner Terms
router.get("/partner/legal/download", async (req, res) => {
  try {
    const version = process.env.LEGAL_CURRENT_VERSION || "1.0";
    const pdfPath = await generatePartnerTermsPDF(version);

    if (!fs.existsSync(pdfPath)) {
      throw new Error("PDF file not found after generation");
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="PartnerTerms_v${version}.pdf"`);

    const stream = fs.createReadStream(pdfPath);
    stream.pipe(res);

    stream.on("error", (err) => {
      console.error("Stream error:", err);
      if (!res.headersSent) {
        return res.status(500).json({ ok: false, error: "internal_error" });
      }
    });
  } catch (err) {
    console.error("❌ Error generating partner terms PDF:", err);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

// Record acceptance
router.post("/partner/legal/accept", authenticate, async (req, res) => {
  try {
    const partner_id = req.user?.partner_id || null;
    if (!partner_id) {
      return res.status(403).json({ ok: false, error: "partner_required" });
    }

    const version = process.env.LEGAL_CURRENT_VERSION || "1.0";
    const forwardedFor = req.headers["x-forwarded-for"] || "";
    const ip = String(forwardedFor).split(",")[0].trim() || req.socket.remoteAddress || "";
    const signature = crypto.randomBytes(16).toString("hex");

    await recordAcceptance(partner_id, version, ip, signature);
    res.json({ ok: true, version, signature });
  } catch (err) {
    console.error("❌ Error in /partner/legal/accept:", err);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

module.exports = router;