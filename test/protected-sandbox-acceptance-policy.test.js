'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {assessRuntimeEvidence}=require('../scripts/protected-sandbox/acceptancePolicy');
const expected={headSha:'a'.repeat(40),workflowBlob:'b'.repeat(40),harnessBlob:'c'.repeat(40),imageManifest:'d'.repeat(64),publisherEvidence:'e'.repeat(64),runnerIdentityDigest:'f'.repeat(64),repositoryId:1,runId:2,runAttempt:3};
const evidence={...expected,cleanupDisposition:'runner-destroyed',quarantineCleared:true,faults:Object.fromEntries(['ambiguousCreate','ambiguousRemoval','residualContainer','wholeJobCancellation','daemonUnavailable'].map(k=>[k,'denied-and-reconciled']))};
test('matching claims cannot authorize execution',()=>{const r=assessRuntimeEvidence({expected,evidence});assert.equal(r.accepted,false);assert.equal(r.executionAuthorized,false);assert.equal(r.attestation,false);assert.match(r.reason,/independent authentication/);});
test('every scope mismatch is denied',()=>{for(const k of Object.keys(expected)){const r=assessRuntimeEvidence({expected,evidence:{...evidence,[k]:null}});assert.equal(r.accepted,false);assert.equal(r.reason,'scope mismatch: '+k);}});
test('teardown and every fault are mandatory',()=>{assert.match(assessRuntimeEvidence({expected,evidence:{...evidence,quarantineCleared:false}}).reason,/teardown/);for(const k of Object.keys(evidence.faults)){assert.match(assessRuntimeEvidence({expected,evidence:{...evidence,faults:{...evidence.faults,[k]:null}}}).reason,/fault evidence/);}});
