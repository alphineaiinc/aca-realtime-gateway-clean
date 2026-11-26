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
 return Object.freeze({...structuredClone(state),month,reconciled:true,fixedAndAccruedCents:state.fixedAndAccruedCents,entries:Object.freeze([...state.entries.map(e=>Object.freeze({...e})),entry]),executionAuthorized:false});
}
module.exports={CAP,monthAt,reserveMonthly};

// Each calendar month has its own explicit, independently attested maximum.
function reserveLiabilities({ledgers, request, evidence, now}) {
 const {id, expiresAt, evidenceSha256} = request;
 const {liabilityThrough, months} = evidence;
 if (typeof id !== 'string' || !/^[\w-]{1,100}$/.test(id) || !/^[a-f0-9]{64}$/.test(evidenceSha256) ||
     !Number.isSafeInteger(expiresAt) || expiresAt <= now ||
     !Number.isSafeInteger(liabilityThrough) || liabilityThrough < expiresAt ||
     evidence.allPriorLiabilitiesReconciled !== true || evidence.providerHardLimitVerified !== true ||
     !months || typeof months !== 'object' || Array.isArray(months)) {
  throw Error('Unbounded liability');
 }
 for (const state of Object.values(ledgers)) {
  if (state.reconciled !== true) throw Error('Unreconciled ledger');
  if (state.entries.some(entry => entry.id === id) ||
      state.settlementObservations?.some(record => record.id === id)) throw Error('Reservation replay denied');
 }
 const start = monthAt(now);
 const end = monthAt(liabilityThrough);
 const ordinal = month => Number(month.slice(0, 4)) * 12 + Number(month.slice(5)) - 1;
 const updates = {};
 let cleanup = 0;
 if (Object.keys(months).length !== ordinal(end) - ordinal(start) + 1) throw Error('Incomplete month coverage');
 for (let i = ordinal(start); i <= ordinal(end); i++) {
  const month = Math.floor(i / 12) + '-' + String(i % 12 + 1).padStart(2, '0');
  const state = ledgers[month];
  const bounds = Object.hasOwn(months, month) && months[month];
  if (!state || !bounds) throw Error('Missing monthly ledger or bounds');
  const fixedAndAccrued = cents(bounds.fixedCents) + cents(bounds.accruedCents);
  if (fixedAndAccrued < cents(state.fixedAndAccruedCents)) throw Error('Opening liability understated');
  const {workCents, cleanupCents, taxCents, feeCents, fxCents} = bounds;
  const total = cents(workCents) + cents(cleanupCents) + cents(taxCents) + cents(feeCents) + cents(fxCents);
  cleanup += cleanupCents;
  let used = fixedAndAccrued;
  for (const entry of state.entries) used += entryTotal(entry);
  if (used + total > CAP) throw Error('Budget denied');
  const entry = {id, workCents, cleanupCents, taxCents, feeCents, fxCents, evidenceSha256};
  updates[month] = {...state, fixedAndAccruedCents: fixedAndAccrued, entries: [...state.entries, entry], executionAuthorized: false};
 }
 if (cleanup <= 0) throw Error('Missing cleanup bound');
 return updates;
}

function entryTotal(entry) {
 let total = cents(entry.workCents) + cents(entry.cleanupCents);
 for (const field of ['taxCents', 'feeCents', 'fxCents']) {
  if (Object.hasOwn(entry, field)) total += cents(entry[field]);
 }
 return total;
}

module.exports.reserveLiabilities = reserveLiabilities;
module.exports.entryTotal = entryTotal;
