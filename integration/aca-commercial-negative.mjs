import {pathToFileURL} from "node:url";
const origin="https://alphine-aca-product-staging.onrender.com";
export const checks=[
 ...["/monitor/twilio-debug","/monitor/resilience","/monitor/deploy-matrix","/api/billing/history","/api/billing/document/1"].map(path=>({path,method:"GET",expected:[401]})),
 {path:"/api/billing/pay",method:"POST",expected:[401],body:"{}"},
 ...["/twilio/status","/twilio/stream-status"].flatMap(path=>[
 {path,method:"GET",expected:[405]},
 {path,method:"POST",expected:[415],body:"{}"},
 {path,method:"POST",expected:[403,503],body:"",headers:{"Content-Type":"application/x-www-form-urlencoded","X-Twilio-Signature":"invalid"}}]),
 {path:"/twilio/voice",method:"POST",expected:[403,503],body:"",headers:{"Content-Type":"application/x-www-form-urlencoded","X-Twilio-Signature":"invalid"}},
 {path:"/api/stripe/webhook",method:"POST",expected:[400,503],body:"{}",headers:{"Stripe-Signature":"invalid"}}
];
export async function run(fetcher=fetch,log=console.log){
 let failed=0,disabled=0;
 for(const {path,method,expected,body,headers} of checks){
  try{
   const r=await fetcher(origin+path,{method,redirect:"manual",signal:AbortSignal.timeout(10000),...(method==="POST"?{body,headers:{"Content-Type":"application/json",...headers}}:{})});
   await r.body?.cancel();
   if(!expected.includes(r.status))failed++;
   else if(r.status===503)disabled++;
   log(method,path,r.status,"expected",expected.join("/"));
  }catch(e){failed++;log(method,path,"transport failure");}
 }
 log("Commercial negative acceptance",checks.length-failed,"passed",failed,"failed",disabled,"disabled/unavailable");
 return {failed,disabled,total:checks.length};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const result=await run();if(result.failed)process.exitCode=1;
}
