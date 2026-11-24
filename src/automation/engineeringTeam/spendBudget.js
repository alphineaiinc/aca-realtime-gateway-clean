'use strict';
// All ceilings must come from independently verified provider pricing and maximum
// possible billable tokens. This is a reservation cap, not billing reconciliation.
function createSpendBudget({pool,product,repository,budgetId,ceilings}={}){
 if(!pool||typeof pool.query!=='function'||typeof product!=='string'||!product||typeof repository!=='string'||!repository||typeof budgetId!=='string'||! /^[a-f0-9-]{36}$/.test(budgetId)||!ceilings||!Object.keys(ceilings).length||Object.keys(ceilings).length>8||Object.values(ceilings).some(x=>!Number.isSafeInteger(x)||x<1||x>10000000))throw Error('Invalid spend budget');
 const rates=Object.freeze({...ceilings});
 return Object.freeze({async reserve({model}={}){
  if(!Object.hasOwn(rates,model))throw Error('Unknown model ceiling');
  const amount=rates[model];
  const result=await pool.query('UPDATE engineering_team_spend_budgets SET reserved_calls=reserved_calls+1,reserved_microusd=reserved_microusd+$4 WHERE product=$1 AND repository=$2 AND budget_id=$3 AND reserved_calls<max_calls AND reserved_microusd+$4<=max_microusd AND NOT EXISTS (SELECT 1 FROM engineering_team_stops s WHERE s.product=$1 AND s.repository=$2) AND NOT EXISTS (SELECT 1 FROM engineering_team_quarantine q WHERE q.product=$1 AND q.repository=$2) RETURNING reserved_calls',[product,repository,budgetId,amount]);
  if(result.rowCount!==1)throw Error('Spend budget denied');
  return true;
 }});
}
module.exports={createSpendBudget};
