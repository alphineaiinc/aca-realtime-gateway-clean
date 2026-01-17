// src/brain/billingEngine.js
const fs = require("fs");
const path = require("path");
const pool = require("../db/pool");
const { PDFDocument, StandardFonts } = require("pdf-lib");
const { format } = require("date-fns");

async function generateInvoice(tenantId, partnerId, usageMinutes, aiTokens, ratePerMin, ratePerToken) {
  const amount = (usageMinutes * ratePerMin) + (aiTokens * ratePerToken);
  const periodStart = new Date(new Date().setDate(1));
  const periodEnd = new Date();

  // ---------------------------------------------------------------------
  // Create tenant-specific invoice folder
  // ---------------------------------------------------------------------
  const invoiceDir = path.join(__dirname, "../../public/invoices", String(tenantId));
  fs.mkdirSync(invoiceDir, { recursive: true });

  // ---------------------------------------------------------------------
  // File naming and public URL mapping
  // ---------------------------------------------------------------------
  const invoiceFilename = `invoice_${Date.now()}.pdf`;
  const invoicePath = path.join(invoiceDir, invoiceFilename);
  const publicUrl = `/invoices/${tenantId}/${invoiceFilename}`;

  // ---------------------------------------------------------------------
  // Create PDF document
  // ---------------------------------------------------------------------
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const draw = (text, y, size = 12) =>
    page.drawText(text, { x: 50, y, size, font });

  // ---------------------------------------------------------------------
  // Invoice header and details
  // ---------------------------------------------------------------------
  draw("Alphine AI — Automated Call Attender", 800, 14);
  draw("Billing & Partner Invoice", 785, 13);

  draw(`Invoice #: ${Math.floor(Date.now() / 1000)}`, 765);
  draw(`Invoice Date: ${format(new Date(), "yyyy-MM-dd")}`, 750);
  draw(`Billed To (Partner ID): ${partnerId}`, 735);
  draw(`Tenant ID (Business): ${tenantId}`, 720);

  draw("--------------------------------------------------------------", 705);
  draw(`Usage Minutes: ${usageMinutes}`, 690);
  draw(`AI Tokens Used: ${aiTokens}`, 675);
  draw(`Rate per Minute: $${ratePerMin.toFixed(2)}`, 660);
  draw(`Rate per 1K Tokens: $${(ratePerToken * 1000).toFixed(3)}`, 645);
  draw("--------------------------------------------------------------", 630);
  draw(`Total Amount Due: $${amount.toFixed(2)}`, 615);
  draw("Status: UNPAID", 600);
  draw(`Generated at: ${new Date().toLocaleString()}`, 585);

  draw("--------------------------------------------------------------", 570);
  draw("Issued by Alphine AI Inc.", 555);
  draw("For questions, contact billing@alphineai.com", 540);
  draw("This invoice is auto-generated — no signature required.", 525);

  // ---------------------------------------------------------------------
  // Write PDF file
  // ---------------------------------------------------------------------
  const pdfBytes = await pdfDoc.save();
  fs.writeFileSync(invoicePath, pdfBytes);

  // ---------------------------------------------------------------------
  // Store record in database (public URL stored for web access)
  // ---------------------------------------------------------------------
  await pool.query(
    `INSERT INTO billing_invoices 
       (tenant_id, partner_id, usage_minutes, ai_tokens, amount_usd, period_start, period_end, invoice_path)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [tenantId, partnerId, usageMinutes, aiTokens, amount, periodStart, periodEnd, publicUrl]
  );

  console.log("[billingEngine] Invoice generated:", publicUrl);
  return publicUrl;
}

module.exports = { generateInvoice };
