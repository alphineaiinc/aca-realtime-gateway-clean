-- 004_billing_invoices.sql
-- Story 11.3 — Billing Micro-Layer & Invoice Generation
-- Creates billing_invoices table for per-tenant and per-partner billing logs.

CREATE TABLE IF NOT EXISTS billing_invoices (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER REFERENCES master_tenants(id) ON DELETE CASCADE,
  partner_id INTEGER REFERENCES partners(id) ON DELETE SET NULL,
  usage_minutes DECIMAL(10,2) DEFAULT 0,
  ai_tokens INTEGER DEFAULT 0,
  amount_usd DECIMAL(10,2) DEFAULT 0,
  period_start TIMESTAMP NOT NULL,
  period_end TIMESTAMP NOT NULL,
  generated_at TIMESTAMP DEFAULT NOW(),
  invoice_path TEXT,
  status VARCHAR(50) DEFAULT 'unpaid'
);

-- Indexes for faster retrieval
CREATE INDEX IF NOT EXISTS idx_billing_invoices_tenant ON billing_invoices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_billing_invoices_partner ON billing_invoices(partner_id);
