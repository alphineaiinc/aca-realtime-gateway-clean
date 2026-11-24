'use strict';
const {roles}=require('./registry');
// Unmounted provider adapter. Only an explicitly authorized trusted caller may
// supply a configured OpenAI SDK client. No credentials are read here.
function createOpenAITransport({client,models,authorize,maxCalls=8,maxOutputTokens=2000,timeoutMs=30000,budget}={}){
 if(!client||typeof client.responses?.create!=='function'||typeof authorize!=='function'||!models||Object.keys(models).length!==8||Object.keys(roles).some(r=>!Object.hasOwn(models,r)||typeof models[r]!=='string'||!/^[a-zA-Z0-9_.-]{1,100}$/.test(models[r]))||!Number.isSafeInteger(maxCalls)||maxCalls<1||maxCalls>16||!Number.isSafeInteger(maxOutputTokens)||maxOutputTokens<256||maxOutputTokens>4000||!Number.isSafeInteger(timeoutMs)||timeoutMs<1000||timeoutMs>60000)throw Error('Invalid provider configuration');
 if(budget!==undefined&&typeof budget.reserve!=='function')throw Error('Invalid durable budget');
 const selected=Object.freeze({...models});let calls=0,inputTokens=0,outputTokens=0,active=false;
 async function generate(request){
  if(!request||!Object.hasOwn(roles,request.role)||request.mode!=='proposal-only'||typeof request.input!=='string'||Buffer.byteLength(request.input)>128000||typeof request.instructions!=='string'||request.instructions.length>4000)throw Error('Invalid provider request');
  if(await authorize(request.role)!==true)throw Error('Provider authorization denied');
  if(active||calls>=maxCalls)throw Error('Provider budget denied');
  active=true;
  try{
   if(budget&&await budget.reserve()!==true)throw Error('Durable budget denied');
   calls++;
   const result=await client.responses.create({model:selected[request.role],instructions:request.instructions,input:request.input,store:false,max_output_tokens:maxOutputTokens,text:{format:{type:'json_schema',name:'engineering_proposal',strict:true,schema:request.schema}}},{timeout:timeoutMs,maxRetries:0});
   if(!Number.isSafeInteger(result?.usage?.input_tokens)||result.usage.input_tokens<0||!Number.isSafeInteger(result?.usage?.output_tokens)||result.usage.output_tokens<0)throw Error('Usage unavailable');
   inputTokens+=result.usage.input_tokens;outputTokens+=result.usage.output_tokens;
   if(result.status!=='completed'||typeof result.output_text!=='string')throw Error('Incomplete model response');
   return result.output_text;
  }catch{throw Error('Provider request failed');}
  finally{active=false;}
 }
 return Object.freeze({generate,usage:()=>Object.freeze({calls,inputTokens,outputTokens})});
}
module.exports={createOpenAITransport};
