"use strict";
const path=require("node:path");
module.exports=function privateStaticGuard(req,res,next){
 let decoded;
 try {decoded=decodeURIComponent(req.path);} catch {return res.sendStatus(400);}
 const normalized=path.posix.normalize("/"+decoded.replace(/\\/g,"/")).toLowerCase();
 if(normalized==="/invoices"||normalized.startsWith("/invoices/"))return res.sendStatus(404);
 return next();
};
