const origin="https://alphine-aca-product-staging.onrender.com";
const checks=[["GET","/health",200],["GET","/dashboard/business.html",200],["GET","/tenant/profile",401],["GET","/tenant/requests",401],["GET","/tenant/routing/status",401],["POST","/tenant/login",403],["POST","/tenant/login/start",503],["POST","/tenant/login/redeem",503],["POST","/tenant/upload-knowledge",401],["POST","/tenant/onboarding/start",503],["POST","/tenant/routing/prepare",503],["POST","/api/gpt/chat",503],["GET","/invoices/test.pdf",404]];
let failed=0;
for(const [method,path,expected] of checks){
 try{const response=await fetch(origin+path,{method,redirect:"manual",signal:AbortSignal.timeout(90000),...(method==="POST"?{headers:{"Content-Type":"application/json"},body:"{}"}:{})});await response.body?.cancel();console.log(method,path,response.status,"expected",expected);if(response.status!==expected)failed++;}
 catch(e){console.log(method,path,"transport failure",e.name);failed++;}
}
console.log("Hosted acceptance:",checks.length-failed,"passed;",failed,"failed");if(failed)process.exitCode=1;
