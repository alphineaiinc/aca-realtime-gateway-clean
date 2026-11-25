"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {buildWorkflowDefinition,workflowIds}=require("../src/voice/workflowDefinitionCatalog");
const {computeWorkflowState}=require("../src/voice/workflowStateEngine");
for(const id of workflowIds) test("explicit correction wins: "+id,()=>{
 const clusterSchema=buildWorkflowDefinition(id);
 const key=clusterSchema.intake_profile.required[0];
 const state=computeWorkflowState({clusterSchema,session:{active_intent:"capture_request",slots:{[key]:"old"}},extraction:{intent:"capture_request",slot_updates:{[key]:"old"},slot_corrections:{[key]:key==="party_size"?3:"new"}}});
 assert.equal(state.slots[key],key==="party_size"?3:"new");
});
