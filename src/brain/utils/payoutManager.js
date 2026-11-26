// Commercial release gate: no provider transfer until verified balance reservation,
// durable idempotency and settlement reconciliation are implemented.
async function createStripePayout() { return {ok:false,error:'payout_activation_required'}; }
async function createWisePayout() { return {ok:false,error:'payout_activation_required'}; }
async function processPayout() { return {ok:false,error:'payout_activation_required'}; }
module.exports = {createStripePayout,createWisePayout,processPayout};
