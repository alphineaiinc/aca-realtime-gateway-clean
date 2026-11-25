'use strict';
// Budget rows must be provisioned through an authorized operator process.
function createCallBudget({pool,product,repository,budgetId}={}){
 if(!pool||typeof pool.query!=='function'||typeof product!=='string'||!product||typeof repository!=='string'||!repository||typeof budgetId!=='string'||! /^[a-f0-9-]{36}$/.test(budgetId))throw Error('Invalid budget scope');
 return Object.freeze({async reserve(){
  const result=await pool.query('UPDATE engineering_team_call_budgets SET reserved_calls=reserved_calls+1 WHERE product=$1 AND repository=$2 AND budget_id=$3 AND reserved_calls<max_calls RETURNING reserved_calls',[product,repository,budgetId]);
  if(result.rowCount!==1)throw Error('Durable call budget denied');
  return true;
 }});
}
module.exports={createCallBudget};
