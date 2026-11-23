"use strict";
// Process-local counters only; no arbitrary labels or caller data.
let retries=0;
function observeHttpRetry(_meta){retries=Math.min(Number.MAX_SAFE_INTEGER,retries+1);}
function getMetricsText(){
 return "# HELP aca_http_retry_observations_total HTTP retry observations since process start.\n# TYPE aca_http_retry_observations_total counter\naca_http_retry_observations_total "+retries+"\n";
}
module.exports={observeHttpRetry,getMetricsText};
