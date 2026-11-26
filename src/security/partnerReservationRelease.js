'use strict';
// Internal only: caller must establish that dispatch never occurred.
// Do not expose as an API or use for uncertain provider outcomes.
function createPartnerReservationRelease(pool){
 return async function releaseUndispatched(partnerId,requestId){
  if(!Number.isSafeInteger(partnerId)||partnerId<=0||typeof requestId!=='string'||! /^[A-Za-z0-9_-]{16,100}$/.test(requestId))throw Error('Invalid reservation');
  const c=await pool.connect();
  try{
   await c.query('BEGIN');
   await c.query('SELECT partner_id FROM aca_partner_funds WHERE partner_id=$1 FOR UPDATE',[partnerId]);
   const r=await c.query("UPDATE aca_partner_reservations SET state='released' WHERE partner_id=$1 AND request_id=$2 AND state='reserved' RETURNING amount_cents",[partnerId,requestId]);
   if(r.rowCount!==1){await c.query('ROLLBACK');return 'not_released';}
   const u=await c.query('UPDATE aca_partner_funds SET available_cents=available_cents+$2 WHERE partner_id=$1',[partnerId,r.rows[0].amount_cents]);
   if(u.rowCount!==1)throw Error('Missing funds');
   await c.query('COMMIT');return 'released';
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 };
}
module.exports={createPartnerReservationRelease};
