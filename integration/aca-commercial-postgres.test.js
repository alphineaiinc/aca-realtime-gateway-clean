"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs");
const {Pool}=require("pg");
const {recordUsage}=require("../src/analytics/billableUsage");
const {invoiceClosedMonth}=require("../src/brain/closedMonthInvoice");
test("isolated commercial pricing, replay and concurrent invoice acceptance",async()=>{
 const pool=new Pool({connectionString:"postgres://onboarding_test:onboarding_test_only@127.0.0.1:5432/aca_commercial_ci",options:"-c timezone=UTC"});
 try{
 await pool.query("CREATE TABLE public.master_tenants(id integer PRIMARY KEY); INSERT INTO public.master_tenants VALUES(1),(2); CREATE TABLE public.analytics_events(id bigserial PRIMARY KEY,tenant_id integer,event_type text,quantity numeric,unit text,meta jsonb,created_at timestamp DEFAULT NOW()); CREATE TABLE public.billing_invoices(id serial PRIMARY KEY,tenant_id integer,usage_minutes numeric,ai_tokens integer,amount_usd numeric,status text,period_start timestamp,period_end timestamp)");
 for(const name of ["016_billable_usage_keys.sql","017_invoice_periods.sql","draft_aca_usage_identity.sql","draft_aca_period_pricing.sql"])await pool.query(fs.readFileSync("migrations/"+name,"utf8"));
 const event={tenantId:1,eventId:"CA_fixture",kind:"voice_seconds",quantity:60};
 assert.deepEqual(await recordUsage(pool,event),{stored:true});
 assert.deepEqual(await recordUsage(pool,event),{stored:false});
 await assert.rejects(recordUsage(pool,{...event,tenantId:2}),/CONFLICTING_USAGE_EVIDENCE/);
 await assert.rejects(recordUsage(pool,{...event,quantity:61}),/CONFLICTING_USAGE_EVIDENCE/);
 await pool.query("UPDATE public.analytics_events SET created_at='2020-01-15'");
 const input={tenantId:1,year:2020,month:1,minuteRateCents:60,tokenRateMicros:500};
 assert.equal(await invoiceClosedMonth(pool,input),null);
 await pool.query("INSERT INTO public.aca_period_pricing VALUES(1,'2020-01-01',60,500)");
 await assert.rejects(pool.query("UPDATE public.aca_period_pricing SET minute_rate_cents=1"),/IMMUTABLE_PERIOD_PRICE/);
 await assert.rejects(pool.query("DELETE FROM public.aca_period_pricing"),/IMMUTABLE_PERIOD_PRICE/);
 assert.equal(await invoiceClosedMonth(pool,{...input,minuteRateCents:61}),null);
 const results=await Promise.all(Array.from({length:12},()=>invoiceClosedMonth(pool,input)));
 assert.equal(results.filter(Boolean).length,1);
 assert.equal(Number(results.find(Boolean).amount_usd),0.6);
 assert.equal((await pool.query("SELECT count(*)::int AS n FROM public.billing_invoices")).rows[0].n,1);
 assert.equal(await invoiceClosedMonth(pool,{...input,tenantId:2}),null);
 }finally{await pool.end();}
});
