"use strict";
const router=require("express").Router();
// Conversation state is not a customer-facing diagnostic.
router.get("/chat/debug-memory",(_req,res)=>{res.set("Cache-Control","no-store");return res.status(404).json({ok:false,error:"not_found"});});
module.exports=router;
