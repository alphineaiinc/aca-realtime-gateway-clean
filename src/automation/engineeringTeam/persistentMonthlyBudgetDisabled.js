'use strict';
// Disabled P2-17 draft. No runtime registration or provider calls.
// Requires a separately provisioned PostgreSQL table and trusted evidence verifier.
// Never execute schema SQL against existing environments as part of this module.
const {reserveMonthly,monthAt}=require('./aggregateMonthlyBudgetDisabled');
const schemaSQL=`CREATE TABLE da_monthly_budget_disabled (
 month text PRIMARY KEY, state jsonb NOT NULL
);`;
function createPersistentBudget({pool,verifyEvidence,clock=Date.now}={}){
 if(typeof pool?.connect!=='function'||typeof verifyEvidence!=='function'||typeof clock!=='function')throw Error('Missing trusted dependencies');
 return Object.freeze({async reserve(input){
  const request=structuredClone(input);
  const client=await pool.connect();let discard=false;
  try{
   await client.query('BEGIN');
   // Global lock across providers, repositories and calendar months in this database.
   await client.query("SELECT pg_advisory_xact_lock(172150,189)");
   const now=clock(),month=monthAt(now);
   const result=await client.query('SELECT state FROM da_monthly_budget_disabled WHERE month=$1 FOR UPDATE',[month]);
   if(result.rowCount!==1)throw Error('Missing independently reconciled ledger');
   const state=result.rows[0].state;
   // A trusted adapter must authenticate exact cost/cleanup bounds and reconciled opening liability.
   const verdict=await verifyEvidence({request:structuredClone(request),state:structuredClone(state),month,now});
   if(!verdict||verdict.verified!==true||verdict.month!==month||verdict.id!==request.id||verdict.evidenceSha256!==request.evidenceSha256||verdict.workCents!==request.workCents||verdict.cleanupCents!==request.cleanupCents||verdict.fixedAndAccruedCents!==state.fixedAndAccruedCents||!Number.isSafeInteger(verdict.expiresAt)||verdict.expiresAt<=clock())throw Error('Evidence denied');
   const fresh=clock();
   if(monthAt(fresh)!==month)throw Error('Month changed');
   const next=reserveMonthly({state,request,now:fresh});
   const update=await client.query('UPDATE da_monthly_budget_disabled SET state=$2::jsonb WHERE month=$1',[month,JSON.stringify(next)]);
   if(update.rowCount!==1)throw Error('Ledger update denied');
   await client.query('COMMIT');
   return Object.freeze({reserved:true,id:request.id,executionAuthorized:false});
  }catch(error){
   try{await client.query('ROLLBACK');}catch{discard=true;}
   // Ambiguous commit must be reconciled externally; never automatically replay or release.
   throw error;
  }finally{client.release(discard);}
 }});
}
module.exports={createPersistentBudget,schemaSQL};
