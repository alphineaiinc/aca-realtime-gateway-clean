"use strict";
// Trusted internal store. Binding row lock serializes grant admission with revocation.
function createCarrierAdmissionStore(pool){
 async function locked(v,fn){
  const c=await pool.connect();
  try{
   await c.query("BEGIN");
   const b=await c.query("SELECT tenant_id FROM public.aca_carrier_bindings WHERE carrier=$1 AND account_id=$2 AND called_number=$3 AND active FOR UPDATE",[v.carrier,v.accountId,v.calledNumber]);
   const ok=b.rows.length===1&&b.rows[0].tenant_id===v.tenantId&&await fn(c);
   await c.query("COMMIT");return !!ok;
  }catch(e){await c.query("ROLLBACK");throw e;}finally{c.release();}
 }
 return {
 async lookupBinding(v){
  const q=await pool.query("SELECT tenant_id,active FROM public.aca_carrier_bindings WHERE carrier=$1 AND account_id=$2 AND called_number=$3",[v.carrier,v.accountId,v.calledNumber]);
  return q.rows.length===1?{tenantId:q.rows[0].tenant_id,active:q.rows[0].active}:null;
 },
 reserve(v){return locked(v,async c=>(await c.query("INSERT INTO public.aca_carrier_grants(call_key,carrier,account_id,called_number,tenant_id,token_hash,expires_at) VALUES($1,$2,$3,$4,$5,$6,CURRENT_TIMESTAMP + INTERVAL '60 seconds') ON CONFLICT DO NOTHING",[v.key,v.carrier,v.accountId,v.calledNumber,v.tenantId,v.tokenHash])).rowCount===1);},
 consume(v){return locked(v,async c=>(await c.query("UPDATE public.aca_carrier_grants SET consumed_at=clock_timestamp() WHERE call_key=$1 AND carrier=$2 AND account_id=$3 AND called_number=$4 AND tenant_id=$5 AND token_hash=$6 AND consumed_at IS NULL AND expires_at>clock_timestamp()",[v.key,v.carrier,v.accountId,v.calledNumber,v.tenantId,v.tokenHash])).rowCount===1);}
 };
}
module.exports={createCarrierAdmissionStore};
