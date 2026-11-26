"use strict";
const {test} = require("node:test");
const assert = require("node:assert/strict");
const {verifyClosingIssueLink: verify} = require("../src/automation/verifiedPrLink");
const good={prNumber:21,issueNumber:20,repositoryId:"123",data:{repository:{pullRequest:{
  number:21,closingIssuesReferences:{pageInfo:{hasNextPage:false},
  nodes:[{number:20,repository:{databaseId:123}}]}}}}};
test("GitHub-resolved single matching same-repo issue is linked",()=>assert.equal(verify(good),true));
test("missing GraphQL evidence fails closed",()=>assert.equal(verify({...good,data:null}),false));
test("foreign repository fails closed",()=>{
  const data=structuredClone(good.data);
  data.repository.pullRequest.closingIssuesReferences.nodes[0].repository.databaseId=456;
  assert.equal(verify({...good,data}),false);
});
test("pagination and multiple references are ambiguous",()=>{
  const data=structuredClone(good.data);
  data.repository.pullRequest.closingIssuesReferences.pageInfo.hasNextPage=true;
  assert.equal(verify({...good,data}),false);
  data.repository.pullRequest.closingIssuesReferences.pageInfo.hasNextPage=false;
  data.repository.pullRequest.closingIssuesReferences.nodes.push({number:30,repository:{databaseId:123}});
  assert.equal(verify({...good,data}),false);
});
test("mismatched PR or issue numbers fail closed",()=>{
  assert.equal(verify({...good,prNumber:22}),false);
  assert.equal(verify({...good,issueNumber:19}),false);
});
