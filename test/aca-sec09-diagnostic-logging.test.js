"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {operationalConsole}=require("../src/voice/voiceLogger");
test("SEC09 emits typed evidence without weakening redaction",()=>{
 const original=console.log; const records=[];
 try {
 console.log=value=>records.push(value);
 operationalConsole.log("ACA_SEC09_START",{serviceMatches:true,secret:"secret"});
 operationalConsole.log("ACA_SEC09_PROXY",{hopCount:2,markerPresent:true,resolvedIsMarker:false,noTrustIsMarker:false,peer:"192.0.2.1",headers:{authorization:"secret"}});
 operationalConsole.log(JSON.stringify({event:"ACA_SEC09_START",serviceMatches:true}));
 } finally {console.log=original;}
 assert.deepEqual(records,[{event:"ACA_SEC09_START",serviceMatches:true},{event:"ACA_SEC09_PROXY",hopCount:2,markerPresent:true,resolvedIsMarker:false,noTrustIsMarker:false},{event:"VOICE_DIAGNOSTIC"}]);
});
