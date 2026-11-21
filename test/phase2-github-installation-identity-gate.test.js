"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict");
const {assessGithubInstallationIdentity:check}=require("../src/automation/phase2GithubInstallationIdentityGate");
const pins={expectedRepositoryId:1080201236,expectedReviewerAppId:5858755,
 expectedReviewerInstallationId:184252224,expectedCiIssuerAppId:15368};
const observed={observedRepositoryId:1080201236,
 observedConnectorInstallationId:182795998};
function locked(r){assert.equal(r.status,"no_go");assert.equal(r.reviewerIdentityVerified,false);
 for(const key of ["operationalActivationAuthorized","agentDispatchAuthorized","dispatched","mergeAuthorized","deployAuthorized","signingAuthorized","productionAuthorization"])assert.equal(r[key],false,key);}
test("real connector installation must not impersonate independent reviewer",()=>{
 const r=check({...pins,...observed});locked(r);
 assert.equal(r.reason,"reviewer_app_installation_unverified");
});
test("wrong reviewer installation, app or CI issuer fails closed",()=>{
 const full={...pins,...observed,observedReviewerAppId:5858755,
 observedReviewerInstallationId:184252224,observedCiIssuerAppId:15368,
 reviewerIdentitySource:"authenticated_github_app_endpoint"};
 for(const override of [{observedReviewerInstallationId:182795998},
 {observedReviewerAppId:999},{observedCiIssuerAppId:999},
 {reviewerIdentitySource:"self_reported"},{observedRepositoryId:1}]){
 const r=check({...full,...override});locked(r);assert.equal(r.observedIdentityMatches,undefined);
 }
});
test("matching identity claims remain non-authorizing",()=>{
 const r=check({...pins,...observed,observedReviewerAppId:5858755,
 observedReviewerInstallationId:184252224,observedCiIssuerAppId:15368,
 reviewerIdentitySource:"authenticated_github_app_endpoint"});
 locked(r);assert.equal(r.observedIdentityMatches,true);
});
test("null and missing pins fail closed",()=>{
 for(const x of [null,{}, {...observed}]){const r=check(x);locked(r);}
});
