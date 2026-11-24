'use strict';
// Internal ingestion only: caller must authenticate provider evidence and resolve tenant independently.
function createVerifiedUsageStore(pool){
 return async function record(f){
  if(!['twilio','openai'].includes(f.source)||!['call_second','ai_token'].includes(f.unit)||
     (f.source==='twilio')!==(f.unit==='call_second')||
     ![f.sourceId,f.priceVersion].every(x=>typeof x==='string'&&/^[A-Za-z0-9_.:-]{1,200}$/.test(x))||
     ![f.tenantId,f.quantity].every(x=>Number.isSafeInteger(x)&&x>0)||
     typeof f.occurredAt!=='string'||!Number.isFinite(Date.parse(f.occurredAt)))throw Error('Invalid usage evidence');
  const args=[f.source,f.sourceId,f.unit,f.tenantId,f.quantity,f.priceVersion,f.occurredAt];
  const result=await pool.query('INSERT INTO aca_verified_usage(source,source_id,unit,tenant_id,quantity,price_version,occurred_at) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING RETURNING source_id',args);
  if(result.rowCount===1)return 'recorded';
  const existing=await pool.query('SELECT 1 FROM aca_verified_usage WHERE source=$1 AND source_id=$2 AND unit=$3 AND tenant_id=$4 AND quantity=$5 AND price_version=$6 AND occurred_at=$7',args);
  if(existing.rowCount!==1)throw Error('Conflicting usage evidence');
  return 'duplicate';
 };
}
function totalCents(lines){
 let micros=0n;
 for(const line of lines){
  if(!/^[0-9]+$/.test(String(line.quantity))||! /^[0-9]+$/.test(String(line.microUsdPerUnit)))throw Error('Invalid price or quantity');
  micros+=BigInt(line.quantity)*BigInt(line.microUsdPerUnit);
 }
 return (micros+5000n)/10000n;
}
module.exports={createVerifiedUsageStore,totalCents};
