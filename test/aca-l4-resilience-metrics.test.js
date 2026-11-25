const test=require("node:test");const assert=require("node:assert/strict");
const {observeHttpRetry,getMetricsText}=require("../src/monitor/resilienceMetrics");
test("retry observations are counted without exposing metadata",()=>{observeHttpRetry({phone:"private-fixture",error:"secret-fixture"});observeHttpRetry(null);const result=getMetricsText();assert.match(result,/aca_http_retry_observations_total 2\n/);assert.doesNotMatch(result,/private-fixture|secret-fixture/);});

test("voice latency metrics reject invalid samples and expose only aggregate values",()=>{const {observeVoiceResponseMs}=require("../src/monitor/resilienceMetrics");for(const x of [-1,NaN,Infinity,3600001,"private-fixture"])observeVoiceResponseMs(x);observeVoiceResponseMs(125);observeVoiceResponseMs(375);const result=getMetricsText();assert.match(result,/aca_voice_response_ms_count 2\n/);assert.match(result,/aca_voice_response_ms_sum 500\n/);assert.doesNotMatch(result,/private-fixture/);});
