// src/brain/utils/legalManager.js
const fs = require("fs");
const PDFDocument = require("pdfkit");
const path = require("path");
const pool = require("../../db/pool");

async function generatePartnerTermsPDF(version = "1.0") {
  const dir = path.join(__dirname, "../../../public/legal");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const docPath = path.join(dir, `PartnerTerms_v${version}.pdf`);

  const doc = new PDFDocument();
  doc.pipe(fs.createWriteStream(docPath));

  doc.fontSize(18).text("Alphine AI – Partner Terms of Service", { align: "center" });
  doc.moveDown().fontSize(12).text(`Version: ${version}`);
  doc.moveDown().text(
    "These terms govern participation in the Alphine AI Partner Reward Program. " +
      "By accepting, you agree to comply with applicable laws and Alphine AI policies."
  );
  doc.end();

  return docPath;
}

async function recordAcceptance(partner_id, version, ip, token) {
  await pool.query(
    `INSERT INTO partner_legal_acceptance (partner_id, version, ip_address, signature_token)
     VALUES ($1,$2,$3,$4)`,
    [partner_id, version, ip, token]
  );
}

module.exports = { generatePartnerTermsPDF, recordAcceptance };
