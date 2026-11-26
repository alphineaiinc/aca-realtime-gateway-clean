"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
test("PostgreSQL immutable trigger migration uses paired dollar-quote delimiters",()=>{
 const sql=fs.readFileSync(path.join(__dirname,"../migrations/aca_automation_correction_ledger.sql"),"utf8");
 assert.match(sql,/RETURNS trigger LANGUAGE plpgsql AS \$function\$/);
 assert.match(sql,/END;\s*\$function\$;/);
 assert.match(sql,/BEFORE UPDATE OR DELETE ON aca_automation\.correction_events/);
 assert.doesNotMatch(sql,/LANGUAGE plpgsql AS \$\s*\n/);
});
