"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const source=fs.readFileSync(path.join(__dirname,"../docs/automation/stage3-disabled-integration/original-pr-supervision-events.yml.txt"),"utf8");
test("CI completion wakes a full sweep without consuming workflow artifacts or candidate SHA",()=>{
 assert.match(source,/workflow_run:\s+workflows: \['ACA CI'\]\s+types: \[completed\]/);
 assert.match(source,/const targeted = \['pull_request','pull_request_review'\]/);
 assert.match(source,/prNumber = targeted \? Number\(process.env.ACA_PR_NUMBER\) : null/);
 assert.doesNotMatch(source,/download-artifact|workflow_run\.head_sha|workflow_run\.conclusion|pull_request_target/);
});
test("observer workflow retains read-only permissions and default branch checkout",()=>{
 const permissions=source.split("permissions:\n")[1].split("jobs:")[0];
 assert.match(permissions,/contents: read/);
 assert.doesNotMatch(permissions,/write|id-token/);
 assert.match(source,/ref: .*github.event.repository.default_branch/);
 assert.match(source,/persist-credentials: false/);
});

// The original observer contract is tested above; active definitions must remain inert.
test("disabled integration workflows cannot trigger observation, smoke or privileged jobs",()=>{
 for (const name of ["pr-supervision-events","pr-supervision-dry-run","reviewer-staging-http-smoke"]) {
  const active=fs.readFileSync(path.join(__dirname,"../.github/workflows",name+".yml"),"utf8");
  const expectedTail=" (disabled integration hold)\non:\n  workflow_dispatch:\npermissions: {}\njobs:\n  hold:\n    if: ${{ false }}\n    runs-on: ubuntu-latest\n    steps:\n      - run: exit 1\n";
  const archived=fs.readFileSync(path.join(__dirname,"../docs/automation/stage3-disabled-integration","original-"+name+".yml.txt"),"utf8");
  assert.equal(active,archived.split("\n")[0]+expectedTail);
 }
});
