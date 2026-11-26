"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict");
const {listTools,callTool}=require("../src/marketplace/publicTools");
test("public marketplace tool exposes only static capability information",()=>{
 const tools=listTools();assert.equal(tools.length,1);assert.equal(tools[0].annotations.readOnlyHint,true);
 tools[0].name="changed";assert.equal(listTools()[0].name,"aca_get_capabilities");
 assert.match(callTool("aca_get_capabilities",{}).content[0].text,/informational only/);
 for(const args of [null,[],{tenantId:1},{email:"fixture@example.invalid"}])assert.throws(()=>callTool("aca_get_capabilities",args),/INVALID_TOOL_REQUEST/);
 assert.throws(()=>callTool("aca_get_requests",{}),/INVALID_TOOL_REQUEST/);
});
