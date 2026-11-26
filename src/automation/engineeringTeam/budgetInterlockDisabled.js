'use strict';
// Disabled reference interlock. Requires dedicated durable store and independently held pins.
// Store contract: atomic compare-and-set, durable before return, global across all callers.
const {authenticate}=require('./budgetEvidenceDisabled');
function createInterlock({store,keys,clock=Date.now}){
 const pins=Object.freeze({...keys});
 if(!Object.keys(pins).length||typeof store?.read!=='function'||typeof store?.compareAndSet!=='function')throw Error('Missing trusted dependencies');
 return Object.freeze({
 async begin(id){
 if(typeof id!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(id))throw Error('Invalid operation');
 const s=await store.read();
 if(!s||s.pending!==null||!Number.isSafeInteger(s.version)||s.version<0||s.version>=Number.MAX_SAFE_INTEGER)throw Error('Admission blocked');
 const next={version:s.version+1,pending:id};
 if(await store.compareAndSet(s,next)!==true)throw Error('Admission blocked');
 return Object.freeze(next);
 },
 async reconcile(envelope){
 const s=await store.read();
 if(!s||typeof s.pending!=='string'||!Number.isSafeInteger(s.version)||s.version>=Number.MAX_SAFE_INTEGER)throw Error('No reconcilable operation');
 const {payload:p}=authenticate(envelope,pins,{kind:'transaction-reconciliation',id:s.pending,version:s.version,reservationsRetained:true,ledgerReconciled:true},clock());
 if(!['committed','not-committed'].includes(p.outcome))throw Error('Unknown outcome');
 if(await store.compareAndSet(s,{version:s.version+1,pending:null})!==true)throw Error('Reconciliation conflict');
 return {reconciled:true,executionAuthorized:false};
 }
 });
}
module.exports={createInterlock};
