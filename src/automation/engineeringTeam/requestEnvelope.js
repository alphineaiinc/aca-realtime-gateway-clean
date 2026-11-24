'use strict';
const {digest}=require('./patchPlanner');
// Preparation only. Byte bound is not a provider tokenizer guarantee.
function prepareRequestEnvelope({manifest,costEnvelope,request}={}){
 if(manifest?.executionAuthorized!==false||costEnvelope?.executionAuthorized!==false||! /^[a-f0-9]{64}$/.test(manifest.evidenceSha256)||! /^[a-f0-9]{64}$/.test(costEnvelope.evidenceSha256)||request?.role!=='orchestrator'||request.mode!=='proposal-only'||typeof request.input!=='string'||typeof request.instructions!=='string'||!request.schema||typeof request.schema!=='object')throw Error('Request denied');
 if(costEnvelope.manifestDigest!==manifest.evidenceSha256||typeof manifest.budgetId!=='string'||costEnvelope.budgetId!==manifest.budgetId)throw Error('Cost binding denied');
 const model=manifest.models.orchestrator;
 const payload=JSON.stringify({model,input:request.input,instructions:request.instructions,schema:request.schema,maxOutputTokens:manifest.limits.maxOutputTokens});
 const bytes=Buffer.byteLength(payload);
 if(!Number.isSafeInteger(costEnvelope.maxInputTokens)||bytes>costEnvelope.maxInputTokens||bytes>128000||costEnvelope.maxOutputTokens!==manifest.limits.maxOutputTokens||!Object.hasOwn(costEnvelope.ceilings,model)||!Number.isSafeInteger(costEnvelope.ceilings[model])||costEnvelope.ceilings[model]<1)throw Error('Request bound denied');
 return Object.freeze({requestDigest:digest(payload),evidenceSha256:digest(JSON.stringify([manifest.evidenceSha256,costEnvelope.evidenceSha256,digest(payload)])),model,bytes,executionAuthorized:false});
}
module.exports={prepareRequestEnvelope};
