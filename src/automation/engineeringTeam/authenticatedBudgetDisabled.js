'use strict';
const {authenticate}=require('./budgetEvidenceDisabled');
const {createPersistentBudget}=require('./persistentMonthlyBudgetDisabled');
const {monthAt}=require('./aggregateMonthlyBudgetDisabled');
const {createHash}=require('node:crypto');
// Disabled admission facade. Keys must originate outside candidate authority.
function createAuthenticatedBudget({pool,keys,clock=Date.now}){
 const pins=Object.freeze({...keys});
 if(!Object.keys(pins).length)throw Error('Missing trust roots');
 return Object.freeze({async reserve(input,envelope){
 const request=structuredClone(input),proof=structuredClone(envelope);
 const adapter=createPersistentBudget({pool,clock,verifyEvidence:async({request,state,month,now})=>{
 const {payload:p,digest}=authenticate(proof,pins,{kind:'reservation',currency:'CAD',month,id:request.id,workCents:request.workCents,cleanupCents:request.cleanupCents,fixedAndAccruedCents:state.fixedAndAccruedCents,requestExpiresAt:request.expiresAt},now);
 if(digest!==request.evidenceSha256||p.expiresAt<request.expiresAt||p.liabilityThrough<request.expiresAt||!Number.isSafeInteger(p.liabilityThrough)||monthAt(p.liabilityThrough)!==month||p.allPriorLiabilitiesReconciled!==true||p.providerHardLimitVerified!==true)throw Error('Unbounded liability');
 const ledgerDigest=createHash('sha256').update(JSON.stringify(state)).digest('hex');
 if(p.ledgerDigest!==ledgerDigest)throw Error('Ledger evidence mismatch');
 return {...request,verified:true,fixedAndAccruedCents:state.fixedAndAccruedCents,expiresAt:p.expiresAt};
 }});
 return adapter.reserve(request);
 }});
}
module.exports={createAuthenticatedBudget};
