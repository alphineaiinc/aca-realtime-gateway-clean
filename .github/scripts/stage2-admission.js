'use strict';
// Pure admission check; no network or execution side effects.
function admit({event,ref,attempt,repository,approved,config,enabled,now,expires}={}){
 return event==='schedule'&&ref==='refs/heads/main'&&attempt==='1'&&repository==='alphineaiinc/aca-realtime-gateway-clean'&&typeof config==='string'&&/^[a-f0-9]{40}$/.test(config)&&approved===config&&enabled==='true'&&Number.isSafeInteger(now)&&Number.isSafeInteger(expires)&&now<expires&&expires-now<=86400000;
}
module.exports={admit};
