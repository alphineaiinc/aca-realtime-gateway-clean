'use strict';
// Development-only receipt store. Caller must supply a dedicated scoped DB role.
// A receipt is not an execution authorization. No automatic retry.
function createFixtureReceiptStore({pool,expected}={}){
 if(typeof pool?.query!=='function'||!expected)throw Error('Invalid receipt store');
 const pinned=Object.freeze({harnessSha:expected.harnessSha,image:expected.image,fixtureSha256:expected.fixtureSha256,attemptId:expected.attemptId});
 if(typeof pinned.harnessSha!=='string'||!/^[a-f0-9]{40}$/.test(pinned.harnessSha)||typeof pinned.image!=='string'||!/^node@sha256:[a-f0-9]{64}$/.test(pinned.image)||typeof pinned.fixtureSha256!=='string'||!/^[a-f0-9]{64}$/.test(pinned.fixtureSha256)||typeof pinned.attemptId!=='string'||!/^aca-fixture-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(pinned.attemptId))throw Error('Invalid receipt scope');
 function parameters(receipt){
  if(!receipt||Object.keys(pinned).some(k=>receipt[k]!==pinned[k])||typeof receipt.reportSha256!=='string'||!/^[a-f0-9]{64}$/.test(receipt.reportSha256))return null;
  return [pinned.attemptId,pinned.harnessSha,pinned.image,pinned.fixtureSha256,receipt.reportSha256];
 }
 const outcome=status=>Object.freeze({status,executionAuthorized:false});
 async function consumeReceipt(receipt){
  const params=parameters(receipt);
  if(!params)return outcome('denied');
  try{
   const result=await pool.query('INSERT INTO sandbox_fixture_receipts(attempt_id,harness_sha,image,fixture_sha256,report_sha256) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING attempt_id',params);
   if(result.rowCount===1&&result.rows?.[0]?.attempt_id===pinned.attemptId)return outcome('inserted');
   return outcome(result.rowCount===0?'duplicate':'unknown');
  }catch{return outcome('unknown');}
 }
 return Object.freeze({consumeReceipt});
}
module.exports={createFixtureReceiptStore};
