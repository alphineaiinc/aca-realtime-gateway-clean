'use strict';
const {createActivationManifest}=require('./activationManifest');
const {createIdentityVerifier}=require('./identityVerifier');
const {createDurableQueue}=require('./durableQueue');
const {createDurableApprovalPolicy}=require('./durableApproval');
const {createSpendBudget}=require('./spendBudget');
// Initialization is deliberately inert: no provider clients, scheduler or
// external writes are created. Real execution requires separate acceptance.
function initializeRuntime({config,pool,identity,ceilings}={}){
 const manifest=createActivationManifest(config);
 if(!pool||typeof pool.query!=='function'||typeof pool.connect!=='function')throw Error('Transactional pool required');
 if(!ceilings||Object.values(manifest.models).some(model=>!Object.hasOwn(ceilings,model)))throw Error('Model ceilings required');
 const authenticate=createIdentityVerifier(identity);
 const scopes=[manifest.scope];
 const queue=createDurableQueue({pool,scopes,authenticate});
 const approvals=createDurableApprovalPolicy({pool,scopes,authenticate});
 const budget=createSpendBudget({pool,...manifest.scope,budgetId:manifest.budgetId,ceilings});
 return Object.freeze({manifest,queue,approvals,budget,authenticate,status:'initialized-inert',executionAllowed:()=>false});
}
module.exports={initializeRuntime};
