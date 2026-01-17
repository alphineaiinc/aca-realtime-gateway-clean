// src/brain/utils/legalManager.js
const fs = require("fs");
const PDFDocument = require("pdfkit");
const path = require("path");
const pool = require("../../db/pool");

async function generatePartnerTermsPDF(version = "1.0") {
  // Use /tmp in Render for write safety
  const dir = process.env.RENDER ? "/tmp" : path.join(__dirname, "../../../public/legal");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const docPath = path.join(dir, `PartnerTerms_v${version}.pdf`);
  const doc = new PDFDocument();

  const stream = fs.createWriteStream(docPath);
  doc.pipe(stream);

  doc.fontSize(18).text("Alphine AI – Partner Terms of Service", { align: "center" });
  doc.moveDown().fontSize(12).text(`Version: ${version}`);
  doc.moveDown().text(
    "These terms govern participation in the Alphine AI Partner Reward Program. " +
      "By accepting, you agree to comply with Alphine AI's policies and all applicable laws."
  );

  doc.end();

  // Wait for the stream to finish
  await new Promise((resolve, reject) => {
    stream.on("finish", resolve);
    stream.on("error", reject);
  });

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
