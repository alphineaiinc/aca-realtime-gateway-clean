'use strict';
const {roles}=require('./registry');
// Unmounted provider adapter. Only an explicitly authorized trusted caller may
// supply a configured OpenAI SDK client. No credentials are read here.
function createOpenAITransport({client,models,authorize,maxCalls=8,maxOutputTokens=2000,timeoutMs=30000,budget}={}){
 if(!client||typeof client.responses?.create!=='function'||typeof authorize!=='function'||!models||Object.keys(models).length!==8||Object.keys(roles).some(r=>!Object.hasOwn(models,r)||typeof models[r]!=='string'||!/^[a-zA-Z0-9_.-]{1,100}$/.test(models[r]))||!Number.isSafeInteger(maxCalls)||maxCalls<1||maxCalls>16||!Number.isSafeInteger(maxOutputTokens)||maxOutputTokens<256||maxOutputTokens>4000||!Number.isSafeInteger(timeoutMs)||timeoutMs<1000||timeoutMs>60000)throw Error('Invalid provider configuration');
 if(budget!==undefined&&typeof budget.reserve!=='function')throw Error('Invalid durable budget');
 const selected=Object.freeze({...models});let calls=0,inputTokens=0,outputTokens=0,active=false,halted=false;
 async function generate(request){
  if(!request||!Object.hasOwn(roles,request.role)||request.mode!=='proposal-only'||typeof request.input!=='string'||Buffer.byteLength(request.input)>128000||typeof request.instructions!=='string'||request.instructions.length>4000)throw Error('Invalid provider request');
  // Snapshot the complete request before any asynchronous authorization or reservation.
  const snapshot=structuredClone(request);
  if(await authorize(snapshot.role)!==true)throw Error('Provider authorization denied');
  if(halted||active||calls>=maxCalls)throw Error('Provider budget denied');
  active=true;
  try{
   if(budget&&await budget.reserve({model:selected[snapshot.role]})!==true)throw Error('Durable budget denied');
   // Re-evaluate policy after the durable reservation and immediately before the external side effect.
   // A revoked reservation remains consumed; it is never refunded or automatically retried.
   if(await authorize(snapshot.role)!==true)throw Error('Provider authorization revoked');
   calls++;
   const result=await client.responses.create({model:selected[snapshot.role],instructions:snapshot.instructions,input:snapshot.input,store:false,max_output_tokens:maxOutputTokens,text:{format:{type:'json_schema',name:'engineering_proposal',strict:true,schema:snapshot.schema}}},{timeout:timeoutMs,maxRetries:0});
   if(!Number.isSafeInteger(result?.usage?.input_tokens)||result.usage.input_tokens<0||!Number.isSafeInteger(result?.usage?.output_tokens)||result.usage.output_tokens<0)throw Error('Usage unavailable');
   inputTokens+=result.usage.input_tokens;outputTokens+=result.usage.output_tokens;
   if(result.usage.output_tokens>maxOutputTokens){halted=true;throw Error('Output budget exceeded');}
   if(result.status!=='completed'||typeof result.output_text!=='string')throw Error('Incomplete model response');
   return result.output_text;
  }catch{halted=true;throw Error('Provider request failed');}
  finally{active=false;}
 }
 return Object.freeze({generate,usage:()=>Object.freeze({calls,inputTokens,outputTokens})});
}
module.exports={createOpenAITransport};
