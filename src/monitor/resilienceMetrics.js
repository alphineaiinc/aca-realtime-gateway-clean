"use strict";
// Process-local counters only; no arbitrary labels or caller data.
let retries=0;
let voiceCount=0,voiceSum=0;
function observeVoiceResponseMs(ms){if(!Number.isFinite(ms)||ms<0||ms>3600000)return;voiceCount=Math.min(Number.MAX_SAFE_INTEGER,voiceCount+1);voiceSum=Math.min(Number.MAX_SAFE_INTEGER,voiceSum+ms);}
function observeHttpRetry(_meta){retries=Math.min(Number.MAX_SAFE_INTEGER,retries+1);}
function getMetricsText(){
 return "# HELP aca_http_retry_observations_total HTTP retry observations since process start.\n# TYPE aca_http_retry_observations_total counter\naca_http_retry_observations_total "+retries+"\n# TYPE aca_voice_response_ms summary\naca_voice_response_ms_count "+voiceCount+"\naca_voice_response_ms_sum "+voiceSum+"\n";
}
module.exports={observeHttpRetry,observeVoiceResponseMs,getMetricsText};
