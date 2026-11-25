"use strict";
const {test} = require("node:test");
const assert = require("node:assert/strict");
const {eligibleIssue} = require("../.github/scripts/pr-supervision-observer");
const labels = ["aca:auto/docs-test","aca:auto/eligible","aca:auto/active"];
test("live allowlisted active standard issue is eligible",()=>{
  assert.equal(eligibleIssue({state:"open",labels:labels.map(name=>({name}))}),true);
});
test("unallowlisted, inactive, blocked or closed issues fail closed",()=>{
  for(const altered of [
    {state:"open",labels:labels.slice(1)},
    {state:"open",labels:labels.slice(0,2)},
    {state:"open",labels:[...labels,"aca:auto/blocked"]},
    {state:"closed",labels},
    {state:"open",labels,pull_request:{}},
    {state:"open",labels:null}
  ]) assert.equal(eligibleIssue(altered),false);
});
test("label comparisons are case-insensitive",()=>{
  assert.equal(eligibleIssue({state:"open",labels:labels.map(x=>x.toUpperCase())}),true);
});
