'use strict';
function admit(c={}){
 return (c.event==='schedule'||c.event==='workflow_dispatch')&&c.ref==='refs/heads/main'&&c.attempt==='1'&&c.repository==='alphineaiinc/aca-realtime-gateway-clean'&&/^[a-f0-9]{40}$/.test(c.config||'')&&c.approved===c.config&&c.enabled==='true'&&[c.now,c.start,c.expires,c.controlVersion].every(Number.isSafeInteger)&&c.controlVersion%1000===0&&c.controlVersion+2000<=c.start&&c.start<=c.now&&c.now<c.expires&&c.expires-c.start<=86400000;
}
module.exports={admit};
