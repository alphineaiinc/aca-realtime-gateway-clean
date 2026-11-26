'use strict';
const {roles}=require('./registry');
const {digest}=require('./patchPlanner');
// Non-secret configuration manifest. Never activates a provider or publishes.
function createActivationManifest({scope,models,budgetId,paths,issue,runnerImage,limits}={}){
 if(!scope||typeof scope.product!=='string'||! /^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/.test(scope.product)||typeof scope.repository!=='string'||! /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(scope.repository)||typeof scope.sha!=='string'||! /^[a-f0-9]{40}$/.test(scope.sha))throw Error('Invalid activation scope');
 if(!models||Object.keys(models).length!==8||Object.keys(roles).some(r=>!Object.hasOwn(models,r)||typeof models[r]!=='string'||! /^[A-Za-z0-9_.-]{1,100}$/.test(models[r])))throw Error('Eight model selections required');
 if(typeof budgetId!=='string'||! /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(budgetId)||!Number.isSafeInteger(issue)||issue<1||!Array.isArray(paths)||!paths.length||paths.length>2||new Set(paths).size!==paths.length||paths.some(p=>typeof p!=='string'||! /^(src|test)\/[A-Za-z0-9_/-]+\.js$/.test(p)||p.split('/').some(s=>!s)))throw Error('Invalid evidence configuration');
 if(typeof runnerImage!=='string'||! /^node@sha256:[a-f0-9]{64}$/.test(runnerImage))throw Error('Pinned runner image required');
 if(!limits||!Number.isSafeInteger(limits.maxCalls)||limits.maxCalls<8||limits.maxCalls>16||!Number.isSafeInteger(limits.maxOutputTokens)||limits.maxOutputTokens<256||limits.maxOutputTokens>4000||!Number.isSafeInteger(limits.maxSpendMicrousd)||limits.maxSpendMicrousd<1||limits.maxSpendMicrousd>10000000)throw Error('Invalid activation limits');
 const payload=Object.freeze({scope:Object.freeze({product:scope.product,repository:scope.repository,sha:scope.sha}),models:Object.freeze(Object.fromEntries(Object.keys(roles).map(r=>[r,models[r]]))),budgetId,paths:Object.freeze([...paths]),issue,runnerImage,limits:Object.freeze({maxCalls:limits.maxCalls,maxOutputTokens:limits.maxOutputTokens,maxSpendMicrousd:limits.maxSpendMicrousd}),mode:'proposal-only'});
 return Object.freeze({...payload,evidenceSha256:digest(JSON.stringify(payload)),executionAuthorized:false});
}
module.exports={createActivationManifest};
