-- 005_billing_payments.sql
-- Story 11.4 – Payment Processing & Invoice Status Sync
-- Adds payment tracking columns to billing_invoices

ALTER TABLE billing_invoices
ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS paid_by VARCHAR(100),
ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50),
ADD COLUMN IF NOT EXISTS payment_reference VARCHAR(120),
ADD COLUMN IF NOT EXISTS notes TEXT;

-- optional: tighten status column to controlled values
ALTER TABLE billing_invoices
ALTER COLUMN status SET DEFAULT 'unpaid';

-- create helper index for payment queries
CREATE INDEX IF NOT EXISTS idx_billing_invoices_status
  ON billing_invoices(status);
