"use strict";
const {deliverOne}=require("./requestNotificationWorker");
function enabled(env){
 return env.ACA_PRODUCTION_EMAIL_SCHEDULER==="true" &&
 env.ACA_PRODUCTION_EMAIL_ENABLED==="true" &&
 env.RENDER_SERVICE_ID==="srv-d3rfh8umcj7s73cj28c0" &&
 env.ACA_STAGING_EMAIL_ONLY!=="true" &&
 env.ACA_STAGING_ACCEPTANCE_RUN!=="true" &&
 env.ACA_STAGING_ACCEPTANCE_SEND!=="true" &&
 /^[a-zA-Z0-9_]{1,63}$/.test(env.ACA_PRODUCTION_EMAIL_DATABASE||"") &&
 env.ACA_PRODUCTION_EMAIL_DATABASE!=="aca_product_staging";
}
function start({pool,env=process.env,deliver=deliverOne,onError=()=>{},schedule=setTimeout,cancel=clearTimeout}={}){
 let stopped=false,timer=null,active=null;
 const stop=()=>{stopped=true;if(timer!==null){cancel(timer);timer=null;}return active||Promise.resolve();};
 if(!enabled(env))return {stop};
 const arm=()=>{
 if(stopped||!enabled(env))return;
 timer=schedule(()=>{
 timer=null;
 if(stopped||!enabled(env)||active)return;
 active=Promise.resolve().then(()=>{if(!stopped&&enabled(env))return deliver({pool});})
 .catch(()=>{try{onError();}catch{}})
 .finally(()=>{active=null;arm();});
 },60000);
 timer?.unref?.();
 };
 arm();
 return {stop};
}
module.exports={start};
