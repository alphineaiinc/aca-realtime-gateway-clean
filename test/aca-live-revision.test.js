const test=require("node:test"),assert=require("node:assert/strict");
test("hosted revision gate rejects missing, stale and unavailable revisions",async()=>{
 const {verifyRevision}=await import("../integration/aca-live-revision.mjs");const sha="a".repeat(40);
 const fake=(revision,status=200)=>async()=>({status,json:async()=>({ok:true,service:"ACA-Orchestrator",revision})});
 assert.equal(await verifyRevision(sha,fake(sha)),true);
 for(const rev of [undefined,"b".repeat(40)])await assert.rejects(verifyRevision(sha,fake(rev)));
 await assert.rejects(verifyRevision(sha,fake(sha,503)));
 await assert.rejects(verifyRevision("short",fake(sha)));
});
