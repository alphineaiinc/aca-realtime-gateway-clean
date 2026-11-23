"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {revokeRecipient,activateRecipient}=require("../src/voice/notificationRecipientLifecycle");
test("recipient revocation is tenant scoped and idempotent",async()=>{
  const pool={async query(sql,args){
    assert.match(sql,/WHERE tenant_id=\$1 AND id=\$2/);
    assert.match(sql,/enabled=FALSE/);
    assert.match(sql,/COALESCE\(revoked_at,NOW\(\)\)/);
    assert.deepEqual(args,[7,"42"]);
    return {rowCount:1};
  }};
  assert.equal(await revokeRecipient(pool,7,"42"),true);
  await assert.rejects(revokeRecipient(pool,0,"42"),/invalid_recipient_identity/);
  await assert.rejects(activateRecipient(),/recipient_verification_workflow_required/);
});
