'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {createGovernanceRecovery}=require('../src/automation/engineeringTeam/governanceRecovery');
const scope={product:'aca',repository:'fixture/aca',sha:'a'.repeat(40)};
const approvalId='123e4567-e89b-12d3-a456-426614174000';
const incidentId='223e4567-e89b-12d3-a456-426614174000';
const evidence=action=>createHash('sha256').update(JSON.stringify([scope,action,action==='clear-quarantine'?'qa-testing':null,incidentId])).digest('hex');
function fixture({active=false,approved=true,duplicate=false,identity=true}={}){
 const calls=[];
 const binding=createHash('sha256').update(JSON.stringify([approvalId,scope.product,scope.repository,scope.sha,'queue.recover',evidence('clear-quarantine')])).digest('hex');
 const client={async query(sql,args){
  calls.push({sql,args});
  if(sql==='BEGIN'||sql==='COMMIT'||sql==='ROLLBACK'||sql.startsWith('SELECT pg_advisory'))return {rowCount:0,rows:[]};
  if(sql.startsWith('SELECT incident_id FROM engineering_team_quarantine'))return {rowCount:1,rows:[{incident_id:incidentId}]};
  if(sql.startsWith('SELECT id,binding,requested_by'))return {rowCount:approved?1:0,rows:approved?[{id:approvalId,binding,requested_by:'manager'}]:[]};
  if(sql.startsWith('SELECT 1 FROM engineering_team_tasks'))return {rowCount:active?1:0,rows:active?[{id:'running'}]:[]};
  if(sql.startsWith('INSERT INTO engineering_team_governance_recoveries'))return {rowCount:duplicate?0:1,rows:duplicate?[]:[{approval_id:approvalId}]};
  if(sql.startsWith('DELETE FROM engineering_team_quarantine'))return {rowCount:1,rows:[]};
  return {rowCount:0,rows:[]};
 },release(){}};
 const service=createGovernanceRecovery({pool:{connect:async()=>client},scope,authenticate:async credential=>identity&&credential==='manager'?{...scope,id:'manager',permission:'queue.manage'}:null});
 return {service,calls};
}
const input={credential:'manager',approvalId,action:'clear-quarantine',role:'qa-testing',incidentId,evidenceSha256:evidence('clear-quarantine')};
test('owner-approved quarantine recovery is transactional, scoped and non-authorizing',async()=>{
 const f=fixture();const result=await f.service.recover(input);
 assert.deepEqual(result,{action:'clear-quarantine',role:'qa-testing',recovered:true,executionAuthorized:false});
 assert.equal(f.calls[0].sql,'BEGIN');assert.equal(f.calls.at(-1).sql,'COMMIT');
 assert.ok(f.calls.some(x=>x.sql.startsWith('INSERT INTO engineering_team_governance_recoveries')));
 assert.ok(f.calls.some(x=>x.sql.startsWith('DELETE FROM engineering_team_quarantine')));
 assert.equal(f.service.executionAllowed(),false);
});
test('bad evidence, invalid target, missing approval and wrong identity fail closed',async()=>{
 const f=fixture();
 await assert.rejects(f.service.recover({...input,evidenceSha256:'f'.repeat(64)}),/Recovery denied/);
 await assert.rejects(f.service.recover({...input,incidentId:'323e4567-e89b-12d3-a456-426614174000'}),/Recovery denied/);
 await assert.rejects(f.service.recover({...input,role:'unknown'}));
 await assert.rejects(f.service.recover({...input,credential:'worker'}),/Recovery identity denied/);
 const g=fixture({approved:false});await assert.rejects(g.service.recover(input),/Recovery approval denied/);
 assert.ok(!g.calls.some(x=>x.sql.startsWith('INSERT')||x.sql.startsWith('DELETE')));
});
test('active leases and consumed approvals block recovery before target deletion',async()=>{
 const f=fixture({active:true});await assert.rejects(f.service.recover(input),/active lease/);
 assert.ok(!f.calls.some(x=>x.sql.startsWith('INSERT')||x.sql.startsWith('DELETE')));
 const g=fixture({duplicate:true});await assert.rejects(g.service.recover(input),/already consumed/);
 assert.ok(!g.calls.some(x=>x.sql.startsWith('DELETE')));
});
