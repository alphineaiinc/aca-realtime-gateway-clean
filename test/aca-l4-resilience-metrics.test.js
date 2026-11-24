const test=require("node:test");const assert=require("node:assert/strict");
const {observeHttpRetry,getMetricsText}=require("../src/monitor/resilienceMetrics");
test("retry observations are counted without exposing metadata",()=>{observeHttpRetry({phone:"private-fixture",error:"secret-fixture"});observeHttpRetry(null);const result=getMetricsText();assert.match(result,/aca_http_retry_observations_total 2\n/);assert.doesNotMatch(result,/private-fixture|secret-fixture/);});
