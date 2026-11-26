"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {validDestination,planNotification}=require("../src/voice/notificationRecipientPlanner");
test("destination validation rejects malformed SMS and email header injection",()=>{
  assert.equal(validDestination("sms","+14165550100"),true);
  assert.equal(validDestination("sms","4165550100"),false);
  assert.equal(validDestination("email","fixture@example.invalid"),true);
  assert.equal(validDestination("email","fixture@example.invalid\r\nBcc: other@example.invalid"),false);
});
test("planning is tenant scoped, read-only and redacts destinations",async()=>{
  const pool={async query(sql,args){
    assert.match(sql,/WHERE o.id = \$1 AND o.tenant_id = \$2/);
    assert.match(sql,/r.revoked_at IS NULL/);
    assert.deepEqual(args,["42",7]);
    return {rows:[{recipient_id:"9",channel:"email",destination:"fixture@example.invalid"}]};
  }};
  assert.deepEqual(await planNotification(pool,7,"42"),[{recipientId:"9",channel:"email",idempotencyKey:"aca:intake:7:42:9",mode:"dry_run_only"}]);
  await assert.rejects(planNotification(pool,0,"42"),/invalid_notification_identity/);
});
