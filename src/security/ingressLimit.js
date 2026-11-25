"use strict";
function ingressLimit({max=60,windowMs=60000,capacity=10000,clock=Date.now,globalBudget=false}={}){
 const buckets=new Map();
 return function rateLimit(req,res,next){
 const now=clock(),key=globalBudget?"global":String(req.ip||req.socket?.remoteAddress||"unknown");
 for(const [k,v] of buckets)if(v.until<=now)buckets.delete(k);
 let b=buckets.get(key);
 if(!b){if(buckets.size>=capacity)return res.status(429).json({ok:false,error:"Try again later"});b={count:0,until:now+windowMs};buckets.set(key,b);}
 if(b.count>=max){res.set("Retry-After",String(Math.max(1,Math.ceil((b.until-now)/1000))));return res.status(429).json({ok:false,error:"Try again later"});}
 b.count++;return next();
 };
}
module.exports={ingressLimit};
