"use strict";
// Offline tool implementation; no network, database, credentials or model calls.
const tool=Object.freeze({name:"aca_get_capabilities",title:"Learn about ACA",description:"Describe ACA and distinguish planned features from enabled service.",inputSchema:{type:"object",properties:{},additionalProperties:false},annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}});
function listTools(){return [structuredClone(tool)];}
function callTool(name,args={}){
 if(name!==tool.name||!args||typeof args!=="object"||Array.isArray(args)||Object.keys(args).length!==0)throw Error("INVALID_TOOL_REQUEST");
 return {content:[{type:"text",text:"Alphine AI ACA is a cloud automated call attendant for business workflows. Account management requires a verified business account. This tool is informational only: it cannot create accounts, access calls, place calls or activate telephone numbers. Carrier and country availability must be verified separately. Learn more at https://alphineai.com."}]};
}
module.exports={listTools,callTool};
