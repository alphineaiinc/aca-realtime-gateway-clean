'use strict';
const {createActivationManifest}=require('./activationManifest');
const {createIdentityVerifier}=require('./identityVerifier');
const {createDurableQueue}=require('./durableQueue');
const {createDurableApprovalPolicy}=require('./durableApproval');
const {createSpendBudget}=require('./spendBudget');
const {createQueuePolicyBridge}=require('./queuePolicyBridge');
const {createProviderReservation}=require('./providerReservation');
const {createWorkflowLedger}=require('./workflowLedger');
// Initialization is deliberately inert: no provider clients, scheduler or
// external writes are created. Real execution requires separate acceptance.
function initializeRuntime({config,pool,identity,ceilings,readQueueState}={}){
 const manifest=createActivationManifest(config);
 if(!pool||typeof pool.query!=='function'||typeof pool.connect!=='function')throw Error('Transactional pool required');
 if(!ceilings||Object.values(manifest.models).some(model=>!Object.hasOwn(ceilings,model)))throw Error('Model ceilings required');
 const authenticate=createIdentityVerifier(identity);
 const scopes=[manifest.scope];
 const queue=createDurableQueue({pool,scopes,authenticate});
 const approvals=createDurableApprovalPolicy({pool,scopes,authenticate});
 const budget=createSpendBudget({pool,...manifest.scope,budgetId:manifest.budgetId,ceilings});
 const workflow=createWorkflowLedger({pool,scope:manifest.scope,authenticate});
 const policy=readQueueState===undefined?null:createQueuePolicyBridge({manifest,readQueueState});
 const providerReservation=policy===null?null:createProviderReservation({pool,manifest,policy,authenticate,ceilings});
 return Object.freeze({manifest,queue,approvals,budget,workflow,policy,providerReservation,authenticate,status:'initialized-inert',executionAllowed:()=>false});
}
module.exports={initializeRuntime};
