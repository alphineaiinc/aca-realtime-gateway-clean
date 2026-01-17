// src/routes/partnerLegal.js
const express = require("express");
const jwt = require("jsonwebtoken");
const { generatePartnerTermsPDF, recordAcceptance } = require("../brain/utils/legalManager");
const path = require("path");
const crypto = require("crypto");
const fs = require("fs");

const router = express.Router();

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
      res.status(500).json({ ok: false, error: err.message });
    });
  } catch (err) {
    console.error("❌ Error generating partner terms PDF:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Record acceptance
router.post("/partner/legal/accept", async (req, res) => {
  try {
    const token = (req.headers.authorization || "").replace("Bearer ", "");
    let partner_id = null;
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      partner_id = decoded.partner_id;
    } catch {
      partner_id = req.body.partner_id || 1;
    }

    const version = process.env.LEGAL_CURRENT_VERSION || "1.0";
    const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
    const signature = crypto.randomBytes(16).toString("hex");

    await recordAcceptance(partner_id, version, ip, signature);
    res.json({ ok: true, version, signature });
  } catch (err) {
    console.error("❌ Error in /partner/legal/accept:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
