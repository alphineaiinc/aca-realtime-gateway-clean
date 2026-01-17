-- 006_billing_stats.sql
-- Monthly rollup helper view (safe to CREATE OR REPLACE)

CREATE OR REPLACE VIEW billing_monthly_summary AS
SELECT
  tenant_id,
  to_char(date_trunc('month', generated_at), 'YYYY-MM') AS month,
  SUM(amount_usd) FILTER (WHERE status = 'paid')   AS revenue_paid_usd,
  SUM(amount_usd) FILTER (WHERE status = 'unpaid') AS revenue_unpaid_usd,
  COUNT(*) FILTER (WHERE status = 'paid')          AS paid_count,
  COUNT(*) FILTER (WHERE status = 'unpaid')        AS unpaid_count,
  COUNT(*)                                         AS invoice_count
FROM billing_invoices
GROUP BY tenant_id, date_trunc('month', generated_at)
ORDER BY tenant_id, month;
