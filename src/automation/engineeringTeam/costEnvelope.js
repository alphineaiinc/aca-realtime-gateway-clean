'use strict';
const {createActivationManifest}=require('./activationManifest');
const {digest}=require('./patchPlanner');
// Offline arithmetic only. Prices and token bounds require independent acceptance.
// Rates are micro-USD per million tokens, with no assumed cache discounts.
function createCostEnvelope({manifest,prices,maxInputTokens}={}){
 const pinned=createActivationManifest(manifest);
 if(pinned.evidenceSha256!==manifest.evidenceSha256||manifest.executionAuthorized!==false||!Number.isSafeInteger(maxInputTokens)||maxInputTokens<1||maxInputTokens>1000000||!prices)throw Error('Invalid cost envelope');
 const ceilings=Object.create(null);
 const entries=[];
 for(const model of [...new Set(Object.values(pinned.models))].sort()){
  const p=Object.hasOwn(prices,model)?prices[model]:null;
  if(!p||![p.input,p.output].every(x=>Number.isSafeInteger(x)&&x>0))throw Error('Missing model pricing');
  const cost=(BigInt(maxInputTokens)*BigInt(p.input)+BigInt(pinned.limits.maxOutputTokens)*BigInt(p.output)+999999n)/1000000n;
  if(cost>BigInt(pinned.limits.maxSpendMicrousd))throw Error('Cost envelope exceeds budget');
  ceilings[model]=Number(cost);
  entries.push([model,p.input,p.output,Number(cost)]);
 }
 const worst=Math.max(...Object.values(ceilings));
 if(BigInt(worst)*BigInt(pinned.limits.maxCalls)>BigInt(pinned.limits.maxSpendMicrousd))throw Error('Aggregate cost envelope exceeds budget');
 // Derive usage cost from the pinned rates, never from a caller-supplied price.
 function assessUsage(model,usage){
  const entry=entries.find(e=>e[0]===model);
  if(!entry||!usage||![usage.inputTokens,usage.outputTokens].every(x=>Number.isSafeInteger(x)&&x>=0))throw Error('Usage denied');
  const {inputTokens,outputTokens}=usage;
  const amount=(BigInt(inputTokens)*BigInt(entry[1])+BigInt(outputTokens)*BigInt(entry[2])+999999n)/1000000n;
  if(amount>BigInt(Number.MAX_SAFE_INTEGER))throw Error('Usage cost overflow');
  const actualMicrousd=Number(amount);
  return Object.freeze({inputTokens,outputTokens,actualMicrousd,breach:inputTokens>maxInputTokens||outputTokens>pinned.limits.maxOutputTokens||actualMicrousd>entry[3],executionAuthorized:false});
 }
 return Object.freeze({budgetId:pinned.budgetId,manifestDigest:pinned.evidenceSha256,assessUsage,ceilings:Object.freeze(ceilings),maxInputTokens,maxOutputTokens:pinned.limits.maxOutputTokens,evidenceSha256:digest(JSON.stringify([pinned.evidenceSha256,maxInputTokens,entries])),executionAuthorized:false});
}
module.exports={createCostEnvelope};
