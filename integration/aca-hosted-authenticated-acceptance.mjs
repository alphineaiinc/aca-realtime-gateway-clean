// Explicit manual staging acceptance. No provider calls, no credential logging.
import assert from "node:assert/strict";
const origin="https://alphine-aca-product-staging.onrender.com";
const a=process.env.ACA_ACCEPTANCE_CODE_A,b=process.env.ACA_ACCEPTANCE_CODE_B;
const ids=[process.env.ACA_ACCEPTANCE_TENANT_A,process.env.ACA_ACCEPTANCE_TENANT_B].map(Number);
if(![a,b].every(x=>/^[a-f0-9]{64}$/.test(x||""))||a===b||!ids.every(x=>Number.isSafeInteger(x)&&x>0)||ids[0]===ids[1])throw Error("Distinct disposable staging challenges and tenant IDs required");
async function request(path,token,body){
 const response=await fetch(origin+path,{redirect:"error",signal:AbortSignal.timeout(30000),method:body?"POST":"GET",headers:{...(token?{Authorization:"Bearer "+token}:{}),...(body?{"Content-Type":"application/json"}:{})},...(body?{body:JSON.stringify(body)}:{})});
 return {status:response.status,body:await response.json()};
}
try{
 const tokens=[];
 for(const code of [a,b]){
  const r=await request("/tenant/login/redeem",null,{token:code});
  assert.equal(r.status,200);assert.equal(typeof r.body.token,"string");tokens.push(r.body.token);
 }
 for(let i=0;i<2;i++){
  const r=await request("/tenant/profile?tenant_id="+ids[1-i],tokens[i]);
  assert.equal(r.status,200);assert.equal(Number(r.body.profile.tenant_id),ids[i]);
  const routing=await request("/tenant/routing/status",tokens[i]);assert.equal(routing.status,200);
 }
 const replay=await request("/tenant/login/redeem",null,{token:a});assert.equal(replay.status,401);
 console.log("Hosted positive acceptance: two distinct profiles, routing access and replay denial passed");
}catch(e){console.error("Hosted positive acceptance failed:",e.name);process.exitCode=1;}
