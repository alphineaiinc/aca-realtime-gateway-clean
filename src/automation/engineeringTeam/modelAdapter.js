'use strict';
const {roles}=require('./registry');
const {contract,validateProposal}=require('./contracts');
// Transport is trusted, injected by the application. No provider or network is
// configured here. Model output cannot invoke tools or approve operations.
function createModelAdapters({generate,maxInputBytes=64000,maxOutputBytes=16000}={}){
 if(typeof generate!=='function'||!Number.isSafeInteger(maxInputBytes)||maxInputBytes<1024||maxInputBytes>128000||!Number.isSafeInteger(maxOutputBytes)||maxOutputBytes<1024||maxOutputBytes>32000)throw Error('Invalid adapter configuration');
 return Object.freeze(Object.fromEntries(Object.keys(roles).map(role=>[role,async ctx=>{
  if(ctx?.role?.id!==role||ctx.mode!=='offline-proposal-only')throw Error('Role context denied');
  const spec=contract(role);
  const input=JSON.stringify({task:ctx.task,prior:ctx.prior});
  if(Buffer.byteLength(input)>maxInputBytes)throw Error('Model input budget exceeded');
  const schema={type:'object',additionalProperties:false,required:[...spec.fields],properties:Object.fromEntries(spec.fields.map(field=>[field,{type:'array',items:{type:'string'},minItems:1,maxItems:20}]))};
  const response=await generate(Object.freeze({role,instructions:spec.mission+'\n'+spec.instruction,input,schema,mode:'proposal-only'}));
  if(typeof response!=='string'||Buffer.byteLength(response)>maxOutputBytes)throw Error('Invalid model response');
  let parsed;try{parsed=JSON.parse(response);}catch{throw Error('Invalid model JSON');}
  return validateProposal(role,parsed);
 }]))); 
}
module.exports={createModelAdapters};
