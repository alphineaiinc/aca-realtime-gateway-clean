"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {buildWorkflowDefinition,workflowIds}=require("../src/voice/workflowDefinitionCatalog");
const intake=require("../config/clusterIntakeSchemas");
const {getMissingRequiredSlots}=require("../src/voice/slotEnforcement");
for(const id of workflowIds) test("explicit workflow contract: "+id,()=>{
 const schema=buildWorkflowDefinition(id);
 assert.equal(schema.cluster_id,id);
 const p=schema.intake_profile;
 assert.deepEqual(getMissingRequiredSlots(p,{}),p.required);
 if(id!=="generic"){
 assert.deepEqual(p.required,intake[id].required);
 assert.deepEqual(p.optional,intake[id].optional);
 assert.deepEqual(schema.intents[0].confirmation_slots,intake[id].confirmationFields);
 }
 const slots=Object.fromEntries(p.required.map(s=>[s,s==="phone"?"4165550100":"synthetic"]));
 assert.deepEqual(getMissingRequiredSlots(p,slots),[]);
});
test("unknown workflows never fall back",()=>{for(const id of [undefined,"unknown","__proto__","constructor"])assert.throws(()=>buildWorkflowDefinition(id),/UNKNOWN_WORKFLOW_ID/);});
test("definitions are independent",()=>{const a=buildWorkflowDefinition("medical_clinic");a.intake_profile.required.pop();assert.deepEqual(buildWorkflowDefinition("medical_clinic").intake_profile.required,intake.medical_clinic.required);});
