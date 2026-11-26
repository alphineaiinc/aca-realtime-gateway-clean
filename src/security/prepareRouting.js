"use strict";
const {buildWorkflowDefinition}=require("../voice/workflowDefinitionCatalog");
// Owner-controlled preparation only; no number ownership or activation is implied.
async function prepareRouting(pool,{tenantId,workflowId,phoneNumber}){
 if(!Number.isSafeInteger(tenantId)||tenantId<=0||typeof phoneNumber!=="string"||!/^\+[1-9][0-9]{1,14}$/.test(phoneNumber))throw Error("INVALID_ROUTING_INPUT");
 const schema=buildWorkflowDefinition(workflowId);
 const client=await pool.connect();
 try{
 await client.query("BEGIN");
 const tenant=await client.query("SELECT id FROM public.master_tenants WHERE id=$1 FOR UPDATE",[tenantId]);
 if(tenant.rows.length!==1)throw Error("UNKNOWN_TENANT");
 await client.query("INSERT INTO public.voice_workflow_definitions(workflow_id,version,schema_json,is_active) VALUES($1,$2,$3::jsonb,FALSE) ON CONFLICT DO NOTHING",[workflowId,schema.version,JSON.stringify(schema)]);
 const definition=await client.query("SELECT workflow_id FROM public.voice_workflow_definitions WHERE workflow_id=$1 AND version=$2 AND schema_json=$3::jsonb",[workflowId,schema.version,JSON.stringify(schema)]);
 if(definition.rows.length!==1)throw Error("WORKFLOW_VERSION_CONFLICT");
 await client.query("INSERT INTO public.tenant_workflow_configs(tenant_id,workflow_id,workflow_version,is_active) VALUES($1,$2,$3,FALSE)",[tenantId,workflowId,schema.version]);
 await client.query("INSERT INTO public.tenant_phone_numbers(phone_number,tenant_id,is_active) VALUES($1,$2,FALSE)",[phoneNumber,tenantId]);
 await client.query("COMMIT");return {tenantId,workflowId,active:false};
 }catch(e){try{await client.query("ROLLBACK");}catch{}throw e;}finally{client.release();}
}
module.exports={prepareRouting};
