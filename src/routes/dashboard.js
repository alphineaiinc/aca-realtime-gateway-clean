"use strict";
const express=require("express");
const path=require("path");
const jwt=require("jsonwebtoken");
const router=express.Router();
const ingressRateLimit=require("../security/ingressLimit").ingressLimit({max:30});

function requireDashboardAdmin(req,res,next){
  res.set("Cache-Control","no-store");
  try {
    const auth=req.headers.authorization||"";
    if(!auth.startsWith("Bearer ")||!process.env.JWT_SECRET) throw new Error("unauthorized");
    const claims=jwt.verify(auth.slice(7).trim(),process.env.JWT_SECRET,{algorithms:["HS256"]});
    if(claims.role!=="admin") return res.status(403).json({ok:false,error:"forbidden"});
    next();
  } catch {return res.status(401).json({ok:false,error:"unauthorized"});}
}
const recognizedLimit=require("express-rate-limit").rateLimit({windowMs:60000,limit:30,passOnStoreError:false});
router.use(ingressRateLimit, recognizedLimit, requireDashboardAdmin);
router.get("/", (req,res)=>res.sendFile(path.join(__dirname,"../../public/dashboard/index.html")));
// Raw caller logs and host diagnostics are intentionally not exposed.
router.get("/data", (req,res)=>res.json({entries:[],rawLogsAvailable:false}));
router.get("/brain-status", (req,res)=>res.status(503).json({ok:false,error:"diagnostics_unavailable"}));
module.exports=router;
