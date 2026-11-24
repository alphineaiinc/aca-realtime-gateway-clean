'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {Pool}=require('pg');
const {generateKeyPairSync,sign,createHash}=require('node:crypto');
const {createFixtureAttestationVerifier}=require('../src/automation/protectedSandbox/fixtureAttestation');
const {createFixtureReceiptStore}=require('../src/automation/protectedSandbox/fixtureReceiptStore');
test('disposable PostgreSQL attestation receipts survive independent connections and reject replay',{skip:process.env.RUN_SANDBOX_RECEIPT_CI!=='1',timeout:20000},async t=>{
 const url=new URL(process.env.SANDBOX_RECEIPT_CI_DATABASE_URL);
 assert.equal(url.hostname,'127.0.0.1');assert.equal(url.pathname,'/aca_sandbox_receipt_ci');
 const pools=[new Pool({connectionString:url.toString(),max:2}),new Pool({connectionString:url.toString(),max:2})];
 t.after(async()=>Promise.all(pools.map(p=>p.end())));
 await pools[0].query(fs.readFileSync(path.join(__dirname,'../migrations/draft_sandbox_fixture_receipts.sql'),'utf8'));
 const expected={harnessSha:'a'.repeat(40),image:'node@sha256:'+'b'.repeat(64),fixtureSha256:'c'.repeat(64),attemptId:'aca-fixture-12345678-1234-4234-8234-123456789abc'};
 const keys=generateKeyPairSync('ed25519');
 const publicKey=keys.publicKey.export({type:'spki',format:'pem'});
 const payload={...expected,status:'passed',cleanupConfirmed:true,requiresReconciliation:false,provenance:'unreviewed-fixed-fixture-harness',executionAuthorized:false};
 const report={...payload,reportSha256:createHash('sha256').update(JSON.stringify(payload)).digest('hex')};
 const signature=sign(null,Buffer.from('alphine:fixed-sandbox-attestation:v1\n'+JSON.stringify({...expected,reportSha256:report.reportSha256}),'utf8'),keys.privateKey).toString('hex');
 const make=pool=>createFixtureAttestationVerifier({publicKey,expected,consumeReceipt:createFixtureReceiptStore({pool,expected})});
 const results=await Promise.all(pools.map(pool=>make(pool).inspect({report,signature})));
 assert.equal(results.filter(r=>r.status==='signature-verified').length,1);
 assert.ok(results.every(r=>r.executionAuthorized===false));
 assert.equal((await make(pools[1]).inspect({report,signature})).status,'denied');
 assert.deepEqual((await pools[1].query('SELECT attempt_id,report_sha256 FROM sandbox_fixture_receipts')).rows,[{attempt_id:expected.attemptId,report_sha256:report.reportSha256}]);
 // Validate the minimum privileges needed by the real receipt adapter.
 // The role and its grants are transaction-local to this disposable test.
 const client=await pools[0].connect();
 try{
  await client.query('BEGIN');
  await client.query('CREATE ROLE aca_ci_sandbox_receipt_writer NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT');
  await client.query('REVOKE ALL ON sandbox_fixture_receipts FROM PUBLIC');
  await client.query('GRANT USAGE ON SCHEMA public TO aca_ci_sandbox_receipt_writer');
  await client.query('GRANT INSERT (attempt_id,harness_sha,image,fixture_sha256,report_sha256), SELECT (attempt_id) ON sandbox_fixture_receipts TO aca_ci_sandbox_receipt_writer');
  await client.query('SET LOCAL ROLE aca_ci_sandbox_receipt_writer');
  const second={...expected,attemptId:'aca-fixture-12345678-1234-4234-8234-123456789abd'};
  const consume=createFixtureReceiptStore({pool:client,expected:second});
  assert.equal(await consume({...second,reportSha256:'d'.repeat(64)}),true);
  assert.equal(await consume({...second,reportSha256:'d'.repeat(64)}),false);
  for(const sql of [
   'SELECT report_sha256 FROM sandbox_fixture_receipts',
   'UPDATE sandbox_fixture_receipts SET report_sha256=repeat(\'e\',64)',
   'DELETE FROM sandbox_fixture_receipts',
   'TRUNCATE sandbox_fixture_receipts',
   'ALTER TABLE sandbox_fixture_receipts DROP CONSTRAINT sandbox_fixture_receipts_pkey'
  ]){
   await client.query('SAVEPOINT denied_operation');
   await assert.rejects(client.query(sql),e=>e.code==='42501');
   await client.query('ROLLBACK TO SAVEPOINT denied_operation');
   await client.query('RELEASE SAVEPOINT denied_operation');
  }
 }finally{
  try{await client.query('ROLLBACK');}finally{client.release();}
 }

});
