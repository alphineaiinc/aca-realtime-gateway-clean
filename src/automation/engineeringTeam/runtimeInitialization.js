'use strict';
const {createActivationManifest}=require('./activationManifest');
const {createIdentityVerifier}=require('./identityVerifier');
const {createDurableQueue}=require('./durableQueue');
const {createDurableApprovalPolicy}=require('./durableApproval');
const {createSpendBudget}=require('./spendBudget');
const {createQueuePolicyBridge}=require('./queuePolicyBridge');
const {createProviderOutcome}=require('./providerOutcome');
const {createProviderReservation}=require('./providerReservation');
const {createActivationReviewVerifier}=require('./activationReviewVerifier');
const {prepareRequestEnvelope}=require('./requestEnvelope');
const {createCostEnvelope}=require('./costEnvelope');
const {createWorkflowLedger}=require('./workflowLedger');
// Initialization is deliberately inert: no provider clients, scheduler or
// external writes are created. Real execution requires separate acceptance.
function initializeRuntime({config,pool,identity,ceilings,readQueueState,independentReview,costConfig}={}){
 const manifest=createActivationManifest(config);
 if(!pool||typeof pool.query!=='function'||typeof pool.connect!=='function')throw Error('Transactional pool required');
 if(!ceilings||Object.values(manifest.models).some(model=>!Object.hasOwn(ceilings,model)))throw Error('Model ceilings required');
 const costEnvelope=costConfig===undefined?null:createCostEnvelope({...costConfig,manifest});
 if(costEnvelope&&Object.keys(costEnvelope.ceilings).some(model=>ceilings[model]!==costEnvelope.ceilings[model]))throw Error('Cost ceiling mismatch');
 const authenticate=createIdentityVerifier(identity);
 const scopes=[manifest.scope];
 const queue=createDurableQueue({pool,scopes,authenticate});
 const approvals=createDurableApprovalPolicy({pool,scopes,authenticate});
 const budget=createSpendBudget({pool,...manifest.scope,budgetId:manifest.budgetId,ceilings});
 const workflow=createWorkflowLedger({pool,scope:manifest.scope,authenticate});
 const policy=readQueueState===undefined?null:createQueuePolicyBridge({manifest,readQueueState});
 const reviewVerifier=independentReview===undefined?undefined:createActivationReviewVerifier({...independentReview,manifest});
 // Unreviewed initialization remains inert; runtime cannot expose an unreviewed reservation.
 const providerReservation=policy===null||reviewVerifier===undefined||costEnvelope===null?null:createProviderReservation({pool,manifest,policy,authenticate,ceilings,reviewVerifier,costEvidenceSha256:costEnvelope.evidenceSha256,prepareRequest:request=>prepareRequestEnvelope({manifest,costEnvelope,request})});
 const providerOutcome=providerReservation===null?null:createProviderOutcome({pool,scope:manifest.scope,authenticate,costEnvelope});
 return Object.freeze({providerOutcome,manifest,costEnvelope,queue,approvals,budget,workflow,policy,providerReservation,authenticate,status:'initialized-inert',executionAllowed:()=>false});
}
module.exports={initializeRuntime};
