"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {reconcile}=require("../.github/scripts/pr-supervision-reconcile");
function fixture(pages=[[21],[22]],links={}){
 const calls=[];
 const github={rest:{repos:{get:async()=>({data:{id:42}})},pulls:{list:()=>{throw Error("use paginator");}}},
 paginate:{async *iterator(fn,args){assert.equal(args.state,"open");for(const page of pages){if(page instanceof Error)throw page;yield {data:page.map(number=>({number}))};}}},
 async graphql(query,{pr}){const link=links[pr]||{nodes:[{number:pr+100,repository:{databaseId:42}}],pageInfo:{hasNextPage:false}};return {repository:{pullRequest:{number:pr,closingIssuesReferences:link}}};}};
 const observeOne=async args=>{calls.push([args.prNumber,args.issueNumber]);return {state:"review_pending",mergeAuthorized:false,deployAuthorized:false};};
 return {args:{github,owner:"acme",repo:"service",observeOne},calls};
}
test("periodic reconciliation discovers all pages without a triggering PR event",async()=>{const f=fixture();const result=await reconcile(f.args);assert.deepEqual(f.calls,[[21,121],[22,122]]);assert.equal(result.length,2);assert.ok(result.every(x=>x.decision.mergeAuthorized===false));});
test("targeted review wakeup observes only the current PR",async()=>{const f=fixture();await reconcile({...f.args,prNumber:22});assert.deepEqual(f.calls,[[22,122]]);});
test("ambiguous, incomplete and cross-repository issue associations cannot enter observation",async()=>{for(const link of [{nodes:[{number:1,repository:{databaseId:42}},{number:2,repository:{databaseId:42}}],pageInfo:{hasNextPage:false}},{nodes:[{number:1,repository:{databaseId:42}}],pageInfo:{hasNextPage:true}},{nodes:[{number:1,repository:{databaseId:99}}],pageInfo:{hasNextPage:false}}]){const f=fixture([[21]],{21:link});const result=await reconcile(f.args);assert.deepEqual(f.calls,[]);assert.equal(result[0].state,"blocked");}});
test("failed or duplicate paginated inventory halts before observation",async()=>{for(const pages of [[[21],new Error("API unavailable")],[[21],[21]],[[0]]]){const f=fixture(pages);await assert.rejects(reconcile(f.args));assert.deepEqual(f.calls,[]);}});
