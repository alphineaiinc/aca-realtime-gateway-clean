const cron = require("node-cron");
const pool = require("../../db/pool");
const { createStripePayout } = require("./payoutManager");

cron.schedule("0 3 * * MON", async ()=>{
  const eligible = await pool.query("SELECT partner_id, SUM(amount) as total FROM partner_rewards WHERE redeemed=false GROUP BY partner_id HAVING SUM(amount)>=25");
  for(const e of eligible.rows){
    try{ await createStripePayout(e.partner_id, e.total); }
    catch(err){ console.error("Payout cron error:",err.message); }
  }
});
