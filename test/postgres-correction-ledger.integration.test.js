"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {randomUUID}=require("node:crypto");
const {Pool}=require("pg");
const {appendCorrection}=require("../src/automation/postgresCorrectionLedger");
const {initializeCorrectionLedger}=require("../src/automation/postgresCorrectionLedgerInitializer");
const {readCorrectionHistory}=require("../src/automation/postgresCorrectionHistoryReader");

if (!process.env.ACA_TEST_DATABASE_URL) {
  test("PostgreSQL integration requires isolated ACA_TEST_DATABASE_URL", {skip:true},()=>{});
} else {
  const pool=new Pool({connectionString:process.env.ACA_TEST_DATABASE_URL,max:8});
  const sha=x=>x.repeat(40);
  const base={repositoryId:Math.floor(Math.random()*100000000)+1000000,
    issueNumber:20,prNumber:21,actorId:123,
    priorHeadSha:sha("a"),resultingHeadSha:sha("b"),
    failureFingerprint:"ci:first-failure",eventId:randomUUID()};
  test("PostgreSQL real transactions, concurrent claims, replay and persistence",async()=>{
    try{
      const migration=fs.readFileSync(path.join(__dirname,"../migrations/aca_automation_correction_ledger.sql"),"utf8");
      await pool.query(migration);
      const missingClient=await pool.connect();
      try {
        await assert.rejects(appendCorrection(missingClient,base),/missing_ledger/);
      } finally { missingClient.release(); }
      const initClient=await pool.connect();
      try {
        assert.equal((await initializeCorrectionLedger(initClient,base,{
          verifiedHeadSha:base.priorHeadSha,authenticatedInitializer:true
        })).initialized,true);
        await assert.rejects(initializeCorrectionLedger(initClient,base,{
          verifiedHeadSha:base.priorHeadSha,authenticatedInitializer:true
        }),/ledger_already_initialized/);
        assert.equal((await readCorrectionHistory(initClient,base)).attempts,0);
      } finally {initClient.release();}
      // Use distinct clients so simultaneous transactions actually contend on row locks.
      const [c1,c2]=await Promise.all([pool.connect(),pool.connect()]);
      let outcomes;
      try{
        outcomes=await Promise.allSettled([
          appendCorrection(c1,base),
          appendCorrection(c2,{...base,eventId:randomUUID(),resultingHeadSha:sha("c")})
        ]);
      }finally{c1.release();c2.release();}
      assert.equal(outcomes.filter(x=>x.status==="fulfilled").length,1);
      assert.equal(outcomes.filter(x=>x.status==="rejected").length,1);
      const rows=await pool.query(`SELECT sequence,event_id,resulting_head_sha FROM
        aca_automation.correction_events WHERE repository_id=$1 AND issue_number=$2
        AND pr_number=$3`,[base.repositoryId,base.issueNumber,base.prNumber]);
      assert.equal(rows.rowCount,1);
      const readClient=await pool.connect();
      try {
        const history=await readCorrectionHistory(readClient,base);
        assert.equal(history.attempts,1);
        assert.equal(history.lastResultingHeadSha,rows.rows[0].resulting_head_sha);
      } finally {readClient.release();}
      const first=rows.rows[0];
      const c3=await pool.connect();
      try{
        await assert.rejects(appendCorrection(c3,{...base,
          priorHeadSha:first.resulting_head_sha,
          resultingHeadSha:sha("d"),failureFingerprint:"ci:second-failure",
          eventId:first.event_id}),/duplicate key/);
        const ledger=await pool.query(`SELECT version FROM aca_automation.correction_ledgers
          WHERE repository_id=$1 AND issue_number=$2 AND pr_number=$3`,
          [base.repositoryId,base.issueNumber,base.prNumber]);
        assert.equal(ledger.rows[0].version,1);
        assert.deepEqual(await appendCorrection(c3,{...base,
          priorHeadSha:first.resulting_head_sha,resultingHeadSha:sha("d"),
          failureFingerprint:"ci:second-failure",eventId:randomUUID()}),
          {attempts:2,remaining:0});
        await assert.rejects(appendCorrection(c3,{...base,
          priorHeadSha:sha("d"),resultingHeadSha:sha("e"),
          failureFingerprint:"ci:third-failure",eventId:randomUUID()}),
          /correction_budget_exhausted/);
      }finally{c3.release();}
      const final=await pool.query(`SELECT count(*)::int AS n FROM
        aca_automation.correction_events WHERE repository_id=$1 AND issue_number=$2
        AND pr_number=$3`,[base.repositoryId,base.issueNumber,base.prNumber]);
      assert.equal(final.rows[0].n,2);
      const lastClient=await pool.connect();
      try {
        const history=await readCorrectionHistory(lastClient,base);
        assert.equal(history.attempts,2);
        assert.equal(history.lastResultingHeadSha,sha("d"));
      } finally {lastClient.release();}
    }finally{await pool.end();}
  });
}
