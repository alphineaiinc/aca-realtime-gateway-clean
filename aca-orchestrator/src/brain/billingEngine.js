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
  const invoiceDir = path.join(__dirname, "../../public/invoices", String(tenantId));
  fs.mkdirSync(invoiceDir, { recursive: true });

  const invoicePath = path.join(invoiceDir, `invoice_${Date.now()}.pdf`);
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const draw = (text, y) => page.drawText(text, { x: 50, y, size: 12, font });

  draw("Alphine AI - Automated Call Attender", 800);
  draw(`Tenant ID: ${tenantId}`, 770);
  draw(`Partner ID: ${partnerId}`, 755);
  draw(`Period: ${format(periodStart, "yyyy-MM-dd")} to ${format(periodEnd, "yyyy-MM-dd")}`, 740);
  draw(`Usage Minutes: ${usageMinutes}`, 720);
  draw(`AI Tokens Used: ${aiTokens}`, 705);
  draw(`Total Amount: $${amount.toFixed(2)}`, 690);
  draw("Status: Unpaid", 675);
  draw(`Generated: ${new Date().toISOString()}`, 660);

  const pdfBytes = await pdfDoc.save();
  fs.writeFileSync(invoicePath, pdfBytes);

  await pool.query(
    `INSERT INTO billing_invoices 
       (tenant_id, partner_id, usage_minutes, ai_tokens, amount_usd, period_start, period_end, invoice_path)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [tenantId, partnerId, usageMinutes, aiTokens, amount, periodStart, periodEnd, invoicePath]
  );

  return invoicePath;
}

module.exports = { generateInvoice };
