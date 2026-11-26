'use strict';

const schemaSQL = 'CREATE TABLE da_monthly_budget_disabled (month text PRIMARY KEY, state jsonb NOT NULL);';

async function writeLedger(client, month, state, {expiresAt, preparedMonth}) {
 // The transaction already holds the row locks. Sample live time once in each update
 // so expiry and the Toronto month are evaluated at the same instant.
 const result = await client.query(
  'UPDATE da_monthly_budget_disabled SET state=$2::jsonb ' +
  'FROM (SELECT clock_timestamp() AS instant) AS db_clock WHERE month=$1 ' +
  "AND extract(epoch FROM instant) * 1000 < $3::numeric " +
  "AND to_char(instant AT TIME ZONE 'America/Toronto', 'YYYY-MM') = $4",
  [month, JSON.stringify(state), expiresAt, preparedMonth]
 );
 if (result.rowCount !== 1) throw Error('Ledger update denied');
}

module.exports = {writeLedger, schemaSQL};
