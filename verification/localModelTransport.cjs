'use strict';
// Unmounted local inference transport; the trusted host must independently enforce isolation,
// artifact identity, permission boundaries, expiry and teardown before use.
const {request}=require('node:http');
const roles=new Set(['orchestrator','project-manager','solution-architect','backend-developer','frontend-developer','qa-testing','security-reviewer','devops']);
const model='qwen2.5-coder-1.5b-instruct-q4_k_m';
function createLocalModelTransport({port,authorize,expiresAt,maxCalls=8,timeoutMs=45000}={}){
 if(!Number.isInteger(port)||port<1024||port>65535||typeof authorize!=='function'||!Number.isSafeInteger(expiresAt)||expiresAt<=Date.now()||expiresAt-Date.now()>3600000||!Number.isInteger(maxCalls)||maxCalls<1||maxCalls>8||!Number.isInteger(timeoutMs)||timeoutMs<100||timeoutMs>60000)throw Error('Local model configuration denied');
 let active=false,halted=false,calls=0;const used=new Set();let abort;
 function stop(){halted=true;abort?.();}
 async function generate(input){
  if(halted||active||calls>=maxCalls||Date.now()>=expiresAt)throw Error('Local model unavailable');
  const r=structuredClone(input);
  if(!r||!roles.has(r.role)||used.has(r.role)||r.mode!=='proposal-only'||typeof r.instructions!=='string'||r.instructions.length>4000||typeof r.input!=='string'||Buffer.byteLength(r.input)>16000||!r.schema||typeof r.schema!=='object'||Buffer.byteLength(JSON.stringify(r.schema))>8000)throw Error('Local model request denied');
  if(authorize(r.role)!==true)throw Error('Local model authorization denied');
  const body=JSON.stringify({model,messages:[{role:'system',content:r.instructions},{role:'user',content:r.input}],response_format:{type:'json_object',schema:r.schema},temperature:0,max_tokens:512,stream:false});
  active=true;used.add(r.role);calls++;
  try{
   const output=await new Promise((resolve,reject)=>{
    const req=request({hostname:'127.0.0.1',port,path:'/v1/chat/completions',method:'POST',agent:false,headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}},res=>{
     if(res.statusCode!==200){res.destroy();reject(Error('Local model HTTP denied'));return;}
     const parts=[];let size=0;
     res.on('data',chunk=>{size+=chunk.length;if(size>65536){res.destroy(Error('Local model response limit'));req.destroy();return;}parts.push(chunk);});
     res.on('error',reject);res.on('aborted',()=>reject(Error('Local model response aborted')));
     res.on('end',()=>{try{resolve(JSON.parse(Buffer.concat(parts).toString('utf8')));}catch(e){reject(e);}});
    });
    const timer=setTimeout(()=>req.destroy(Error('Local model timeout')),Math.max(1,Math.min(timeoutMs,expiresAt-Date.now())));
    abort=()=>req.destroy(Error('Local model stopped'));
    req.on('error',reject);req.on('close',()=>clearTimeout(timer));req.end(body);
   });
   if(halted||Date.now()>=expiresAt||authorize(r.role)!==true)throw Error('Local model authorization revoked');
   const choice=output?.choices?.[0], message=choice?.message;
   if(output?.choices?.length!==1||choice.finish_reason!=='stop'||typeof message?.content!=='string'||Buffer.byteLength(message.content)>16000||message.tool_calls?.length||message.function_call||!Number.isSafeInteger(output?.usage?.completion_tokens)||output.usage.completion_tokens<0||output.usage.completion_tokens>512||!Number.isSafeInteger(output.usage.prompt_tokens)||output.usage.prompt_tokens<0)throw Error('Local model output denied');
   JSON.parse(message.content);
   return message.content;
  }catch(e){halted=true;throw e;}finally{active=false;abort=undefined;}
 }
 return Object.freeze({generate,stop,usage:()=>Object.freeze({calls,halted,executionAuthorized:false,releaseApproved:false})});
}
module.exports={createLocalModelTransport,model};
