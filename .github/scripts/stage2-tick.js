'use strict';
const {admit}=require('./stage2-admission');
async function tick({context,clock=Date.now,readStop,observe}={}){
 const allowed=()=>admit({...context,now:clock()});
 const stopped=async()=>{try{return await readStop()!==false;}catch{return true;}};
 if(!allowed()||await stopped()||!allowed())return {status:'denied'};
 const result=await observe();
 if(!allowed()||await stopped()||!allowed())return {status:'denied'};
 if(result?.status!=='observed'||['executionAuthorized','writeAuthorized','deployAuthorized','paidProviderAuthorized'].some(k=>result[k]!==false))throw Error('Observation denied');
 return result;
}
module.exports={tick};
