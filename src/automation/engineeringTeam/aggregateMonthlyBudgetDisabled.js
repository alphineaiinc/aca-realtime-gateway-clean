'use strict';
// Disabled candidate: no provider client, execution grant, or runtime registration.
// All amounts are integer CAD cents, conservatively bounded by independently verified evidence.
const CAP=15000;
const monthFormat=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Toronto',year:'numeric',month:'2-digit'});
function monthAt(ms){
 if(!Number.isSafeInteger(ms)||ms<0)throw Error('Invalid clock');
 const p=monthFormat.formatToParts(new Date(ms));
 return p.find(x=>x.type==='year').value+'-'+p.find(x=>x.type==='month').value;
}
function cents(v){if(!Number.isSafeInteger(v)||v<0||v>CAP)throw Error('Invalid cost bound');return v;}
function reserveMonthly({state,request,now}){
 // Pure transition: caller must serialize and durably commit across ALL providers.
 // No refund, settlement, or rollover release in this conservative offline candidate.
 const month=monthAt(now);
 if(!state||state.month!==month||!Array.isArray(state.entries)||state.reconciled!==true)throw Error('Unreconciled month');
 if(!request||typeof request.id!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(request.id)||! /^[a-f0-9]{64}$/.test(request.evidenceSha256||'')||request.month!==month||request.expiresAt<=now||!Number.isSafeInteger(request.expiresAt)||monthAt(request.expiresAt)!==month)throw Error('Invalid reservation scope');
 const total=cents(request.workCents)+cents(request.cleanupCents);
 if(total<1||request.cleanupCents<1)throw Error('Missing cleanup bound');
 let used=cents(state.fixedAndAccruedCents);
 const ids=new Set();
 for(const e of state.entries){if(!e||typeof e.id!=='string'||ids.has(e.id))throw Error('Invalid ledger');ids.add(e.id);used+=cents(e.workCents)+cents(e.cleanupCents);if(used>CAP)throw Error('Invalid ledger total');}
 if(ids.has(request.id)||used+total>CAP)throw Error('Budget denied');
 const entry=Object.freeze({id:request.id,workCents:request.workCents,cleanupCents:request.cleanupCents,evidenceSha256:request.evidenceSha256});
 return Object.freeze({month,reconciled:true,fixedAndAccruedCents:state.fixedAndAccruedCents,entries:Object.freeze([...state.entries.map(e=>Object.freeze({...e})),entry]),executionAuthorized:false});
}
module.exports={CAP,monthAt,reserveMonthly};
