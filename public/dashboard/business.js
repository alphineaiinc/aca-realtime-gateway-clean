"use strict";
(()=>{const el=id=>document.getElementById(id);let token=null,epoch=0;
const status=s=>{el("status").textContent=s;};
async function api(path,options={},auth=false){const headers={...options.headers};if(auth){if(!token)throw Error("Sign in required");headers.Authorization="Bearer "+token;}const r=await fetch(path,{...options,headers,cache:"no-store"});if(!r.ok)throw Error("Request unsuccessful ("+r.status+")");return r.json();}
const post=(path,data)=>api(path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(data)});
async function refresh(){const current=epoch;const [p,r,q]=await Promise.all([api("/tenant/profile",{},true),api("/tenant/routing/status",{},true),api("/tenant/requests",{},true)]);if(current!==epoch)return;for(const [id,value] of [["profile",p.profile],["routing",r.routing],["requests",q.requests]])el(id).textContent=JSON.stringify(value,null,2);el("account").hidden=false;}
function bind(id,fn){el(id).addEventListener("submit",async e=>{e.preventDefault();try{await fn();}catch(e){status(e.message);}});}
bind("start",async()=>{await post("/tenant/login/start",{email:el("email").value});status("If eligible, a code will be sent.");});
function clearAccount(){epoch++;token=null;for(const id of ["profile","routing","requests"])el(id).textContent="";el("file").value="";el("account").hidden=true;}
bind("redeem",async()=>{clearAccount();const current=epoch;const result=await post("/tenant/login/redeem",{token:el("code").value});el("code").value="";if(current!==epoch)return;token=result.token;await refresh();if(current===epoch)status("Signed in.");});
bind("upload",async()=>{const current=epoch;const form=new FormData();form.append("file",el("file").files[0]);await api("/tenant/upload-knowledge",{method:"POST",body:form},true);if(current===epoch){el("file").value="";status("Knowledge uploaded.");}});
el("refresh").onclick=()=>refresh().catch(e=>status(e.message));
el("logout").onclick=()=>{clearAccount();el("code").value="";status("Signed out.");};
})();