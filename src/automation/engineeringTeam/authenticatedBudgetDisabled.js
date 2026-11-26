'use strict';

const {createPublicKey} = require('node:crypto');
const {authenticate} = require('./budgetEvidenceDisabled');
const {createPersistentBudget} = require('./persistentMonthlyBudgetDisabled');
const {createInterlock} = require('./budgetInterlockDisabled');

// Disabled facade. Trust pins must come from independent custody.
function createAuthenticatedBudget({pool, keys, reconciliationKeys, clock = Date.now}) {
 const pins = Object.freeze({...keys});
 if (!Object.keys(pins).length) throw Error('Missing trust roots');
 const reconciliationPins = Object.freeze({...reconciliationKeys});
 if (reconciliationKeys) {
  const fingerprint = pin => createPublicKey(pin).export({type: 'spki', format: 'der'}).toString('base64');
  const admission = new Set(Object.values(pins).map(fingerprint));
  if (Object.values(reconciliationPins).some(pin => admission.has(fingerprint(pin)))) {
   throw Error('Reconciliation requires independent signing keys');
  }
 }
 const interlock = reconciliationKeys && createInterlock({pool, keys: reconciliationPins, clock});
 return Object.freeze({
  async reserve(input, envelope) {
   const proof = structuredClone(envelope);
   const adapter = createPersistentBudget({pool, clock, verifyEvidence: ({request, version, now}) => {
    const {payload, digest} = authenticate(proof, pins, {
     kind: 'reservation', currency: 'CAD', version, id: request.id, requestExpiresAt: request.expiresAt
    }, now);
    return {...payload, digest};
   }});
   return adapter.reserve(input);
  },
  async reconcile(envelope) {
   if (!interlock) throw Error('Missing reconciliation trust roots');
   return interlock.reconcile(envelope);
  }
 });
}

module.exports = {createAuthenticatedBudget};
