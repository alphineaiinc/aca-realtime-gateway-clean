'use strict';
// Internal only. No provider dispatch or settlement.
function createPartnerReservation(pool){
 return async function reserve(partnerId,requestId,cents){
  if(![partnerId,cents].every(n=>Number.isSafeInteger(n)&&n>0)||typeof requestId!=='string'||! /^[A-Za-z0-9_-]{16,100}$/.test(requestId))throw Error('Invalid reservation');
  const c=await pool.connect();
  try{
   await c.query('BEGIN');
   const funds=await c.query('SELECT available_cents FROM aca_partner_funds WHERE partner_id=$1 FOR UPDATE',[partnerId]);
   if(funds.rowCount!==1)throw Error('No verified funds');
   const prior=await c.query('SELECT amount_cents FROM aca_partner_reservations WHERE partner_id=$1 AND request_id=$2',[partnerId,requestId]);
   if(prior.rowCount){
    if(String(prior.rows[0].amount_cents)!==String(cents))throw Error('Conflicting reservation');
    await c.query('COMMIT');return 'duplicate';
   }
   const debit=await c.query('UPDATE aca_partner_funds SET available_cents=available_cents-$2 WHERE partner_id=$1 AND available_cents >= $2 RETURNING partner_id',[partnerId,cents]);
   if(debit.rowCount!==1)throw Error('Insufficient verified funds');
   await c.query('INSERT INTO aca_partner_reservations(partner_id,request_id,amount_cents) VALUES ($1,$2,$3)',[partnerId,requestId,cents]);
   await c.query('COMMIT');return 'reserved';
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 };
}
module.exports={createPartnerReservation};
