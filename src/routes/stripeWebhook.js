"use strict";
const express=require("express");
const router=express.Router();
const Stripe=require("stripe");
const pool=require("../db/pool");
router.post("/webhook", express.raw({ type: "application/json" }), async(req,res)=>{
 if(process.env.ACA_STRIPE_WEBHOOK_ENABLED!=="true" || !process.env.STRIPE_WEBHOOK_SECRET) return res.status(503).json({received:false});
 let event;
 try {
  const stripe=new Stripe(process.env.STRIPE_SECRET_KEY);
  event=stripe.webhooks.constructEvent(req.body,req.headers["stripe-signature"],process.env.STRIPE_WEBHOOK_SECRET);
 } catch {return res.status(400).json({received:false});}
 try {
  const result=await pool.query(
   "WITH claimed AS (INSERT INTO public.aca_stripe_webhook_events(event_id,event_type,status,processed_at) VALUES ($1,$2,'processed',NOW()) ON CONFLICT (event_id) DO NOTHING RETURNING event_id) INSERT INTO public.aca_stripe_event_inbox(event_id,payload) SELECT event_id,$3::jsonb FROM claimed RETURNING event_id",
   [event.id,event.type,JSON.stringify(event)]
  );
  if(result.rowCount===0){
   const prior=await pool.query("SELECT event_id FROM public.aca_stripe_event_inbox WHERE event_id=$1",[event.id]);
   if(prior.rowCount!==1)return res.status(409).json({received:false,retry:true});
  }
  return res.json({received:true,duplicate:result.rowCount===0});
 } catch {return res.status(500).json({received:false,retry:true});}
});
module.exports=router;
