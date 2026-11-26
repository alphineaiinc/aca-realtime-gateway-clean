"use strict";
// Internal composition boundary only. Never register adapters from request data.
// An adapter must authenticate ingress and bind media admission to verified routing.
function createCarrierRegistry(adapters = []) {
 const registry = new Map();
 for (const adapter of adapters) {
  if (!adapter || !/^[a-z][a-z0-9-]{0,31}$/.test(adapter.id || "") ||
      registry.has(adapter.id) ||
      ["voiceWebhook","consumeStart","statusCallback"].some(k => typeof adapter[k] !== "function"))
   throw Error("INVALID_CARRIER_ADAPTER");
  registry.set(adapter.id,Object.freeze({
   voiceWebhook:adapter.voiceWebhook.bind(adapter),
   consumeStart:adapter.consumeStart.bind(adapter),
   statusCallback:adapter.statusCallback.bind(adapter)
  }));
 }
 return Object.freeze({
  get(id) { return typeof id === "string" ? registry.get(id) || null : null; },
  list() { return Object.freeze([...registry.keys()]); }
 });
}
module.exports={createCarrierRegistry};
