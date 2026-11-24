'use strict';
const {totalCents}=require('./verifiedUsage');
function createBillingPeriodClosure(pool){
 return async function close(tenantId,month){
  if(!Number.isSafeInteger(tenantId)||tenantId<=0||typeof month!=='string'||!/^20[0-9]{2}-(0[1-9]|1[0-2])-01$/.test(month))throw Error('Invalid billing period');
  const c=await pool.connect();
  try{
   await c.query('BEGIN');
   await c.query("SELECT pg_advisory_xact_lock($1::integer,(EXTRACT(YEAR FROM $2::date)*12+EXTRACT(MONTH FROM $2::date))::integer)",[tenantId,month]);
   const prior=await c.query('SELECT invoice_id,amount_cents FROM aca_billing_closures WHERE tenant_id=$1 AND month_start=$2',[tenantId,month]);
   if(prior.rowCount){await c.query('COMMIT');return prior.rows[0];}
   const period=await c.query("SELECT ($1::date+interval '1 month')::date <= (now() AT TIME ZONE 'UTC')::date AS closed",[month]);
   if(!period.rows[0].closed)throw Error('Period not ended');
   const usage=await c.query("SELECT u.unit,u.quantity,p.micro_usd_per_unit FROM aca_verified_usage u JOIN aca_billing_prices p ON p.version=u.price_version AND p.unit=u.unit WHERE u.tenant_id=$1 AND u.occurred_at >= ($2::date::timestamp AT TIME ZONE 'UTC') AND u.occurred_at < (($2::date+interval '1 month') AT TIME ZONE 'UTC')",[tenantId,month]);
   const cents=totalCents(usage.rows.map(x=>({quantity:x.quantity,microUsdPerUnit:x.micro_usd_per_unit})));
   let invoiceId=null;
   if(cents>0n){
    const result=await c.query("INSERT INTO billing_invoices(tenant_id,amount_usd,period_start,period_end,status) VALUES ($1,$2::numeric/100,$3::date,$3::date+interval '1 month','unpaid') RETURNING id",[tenantId,String(cents),month]);
    invoiceId=result.rows[0].id;
   }
   await c.query('INSERT INTO aca_billing_closures(tenant_id,month_start,invoice_id,amount_cents) VALUES ($1,$2,$3,$4)',[tenantId,month,invoiceId,String(cents)]);
   await c.query('COMMIT');return {invoice_id:invoiceId,amount_cents:String(cents)};
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 };
}
module.exports={createBillingPeriodClosure};
