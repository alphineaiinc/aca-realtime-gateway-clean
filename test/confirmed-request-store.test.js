"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {createTenantResolver}=require("../src/voice/tenantResolver");
const {saveConfirmedRequest}=require("../src/voice/confirmedRequestStore");
const {buildWorkflowDefinition}=require("../src/voice/workflowDefinitionCatalog");
async function context(id=7){
 const schema=buildWorkflowDefinition("retail_callback_and_general_service");
 return createTenantResolver({query:async sql=>({rows:sql.includes("tenant_phone_numbers")?[{tenant_id:id,is_active:true}]:[{workflow_id:schema.cluster_id,workflow_version:1,is_active:true,definition_active:true,schema_json:schema}]})})({calledNumber:"+14165550101",callSid:"CA"+"a".repeat(32)});
}
const slots={reason:"Callback",name:"Fixture",phone:"4165550101",tenant_id:99};
test("confirmed request uses verified tenant and allowlisted fields",async()=>{
 const c=await context();let calls=0;
 const id=await saveConfirmedRequest(c,"capture_request",slots,async(sql,p)=>{
 calls++;assert.equal(p[0],7);assert.equal(JSON.parse(p[5]).tenant_id,undefined);
 assert.match(sql,/INSERT INTO public.aca_request_outbox/);assert.match(sql,/ON CONFLICT/);
 return {rows:[{id:1}]};});assert.equal(id,1);assert.equal(calls,1);
});
test("forged context and incomplete details never write",async()=>{
 const c=await context();const query=()=>{throw Error("unexpected write")};
 await assert.rejects(saveConfirmedRequest({...c},"capture_request",slots,query),/INVALID_REQUEST_CONTEXT/);
 await assert.rejects(saveConfirmedRequest(c,"capture_request",{reason:"Callback"},query),/INCOMPLETE_REQUEST/);
});
test("conflicting duplicate and database failure do not report success",async()=>{
 const c=await context();
 await assert.rejects(saveConfirmedRequest(c,"capture_request",slots,async()=>({rows:[]})),/REQUEST_CONFLICT/);
 await assert.rejects(saveConfirmedRequest(c,"capture_request",slots,async()=>{throw Error("offline")}),/offline/);
});
test("separate verified tenants retain separate request keys",async()=>{
 for(const id of [7,9]) await saveConfirmedRequest(await context(id),"capture_request",slots,async(sql,p)=>{assert.equal(p[0],id);return {rows:[{id}]};});
});
