'use strict';

const maxAttempts = 3;
const maxObservationBytes = 32768;

function createPostgresObservationStore({ pool, scope, issue } = {}) {
  const { product, repository, sha } = scope || {};
  if (typeof pool?.connect !== 'function' ||
      typeof product !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/.test(product) ||
      typeof repository !== 'string' || repository.length > 201 ||
      !/^[A-Za-z0-9_-][A-Za-z0-9_.-]*\/[A-Za-z0-9_-][A-Za-z0-9_.-]*$/.test(repository) ||
      typeof sha !== 'string' || !/^[a-f0-9]{40}$/.test(sha) ||
      !Number.isSafeInteger(issue) || issue < 1) {
    throw new Error('Invalid PostgreSQL observation scope');
  }

  return Object.freeze({ async dueEvents() {
    const client=await pool.connect();
    try {
      const {rows}=await client.query(`SELECT event_key FROM engineering_team_manager_observations
        WHERE product=$1 AND repository=$2 AND head_sha=$3 AND issue=$4
        AND observation IS NULL AND attempts BETWEEN 1 AND 2 AND next_attempt_at<=clock_timestamp()
        ORDER BY next_attempt_at,event_key LIMIT 10`,[product,repository,sha,issue]);
      return rows.map(row=>row.event_key);
    } finally {client.release();}
  }, async observeEvent(eventKey, observe) {
    if (typeof eventKey !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/.test(eventKey) ||
        typeof observe !== 'function') {
      throw new Error('Invalid observation event');
    }

    const key = [product, repository, sha, issue, eventKey];
    const client = await pool.connect();
    let discard = false;
    try {
      await client.query('BEGIN');
      await client.query("SET LOCAL lock_timeout = '5s'");
      await client.query("SET LOCAL statement_timeout = '5s'");
      await client.query("SET LOCAL idle_in_transaction_session_timeout = '20s'");
      await client.query(`
        INSERT INTO engineering_team_manager_observations (product,repository,head_sha,issue,event_key)
        VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`, key);
      const { rows: [row] } = await client.query(`
        SELECT attempts, observation, (next_attempt_at > clock_timestamp()) AS deferred FROM engineering_team_manager_observations
        WHERE product=$1 AND repository=$2 AND head_sha=$3 AND issue=$4 AND event_key=$5
        FOR UPDATE`, key);

      let result;
      if (row.observation !== null) {
        result = { status: 'observed', replayed: true, attempts: row.attempts, observation: row.observation };
      } else if (row.attempts >= maxAttempts) {
        result = { status: 'exhausted', replayed: true, attempts: row.attempts };
      } else if (row.deferred === true) {
        result = { status: 'deferred', replayed: true, attempts: row.attempts };
      } else {
        // The callback performs read-only observation. Its unavailable result consumes an attempt.
        const observation = await observe();
        let serialized = null;
        if (observation?.status === 'observed') {
          if (observation.scope?.product !== product || observation.scope?.repository !== repository ||
              observation.scope?.sha !== sha || observation.issue !== issue ||
              observation.executionAuthorized !== false || observation.writeAuthorized !== false ||
              observation.deployAuthorized !== false || observation.paidProviderAuthorized !== false) {
            throw new Error('Observation scope or authority denied');
          }
          serialized = JSON.stringify(observation);
          if (Buffer.byteLength(serialized) > maxObservationBytes) {
            throw new Error('Observation size exceeded');
          }
        } else if (observation?.status !== 'unavailable') {
          throw new Error('Invalid observation result');
        }
        const attempts = row.attempts + 1;
        await client.query(`
          UPDATE engineering_team_manager_observations SET attempts=$6, observation=$7::jsonb,
            next_attempt_at=CASE WHEN $7::jsonb IS NULL AND $6 < 3 THEN clock_timestamp() + make_interval(mins => $6 * 5) ELSE NULL END
          WHERE product=$1 AND repository=$2 AND head_sha=$3 AND issue=$4 AND event_key=$5`,
        [...key, attempts, serialized]);
        result = serialized === null
          ? { status: attempts === maxAttempts ? 'exhausted' : 'unavailable', replayed: false, attempts }
          : { status: 'observed', replayed: false, attempts, observation: JSON.parse(serialized) };
      }
      await client.query('COMMIT');
      return result;
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        discard = true;
      }
      throw error;
    } finally {
      client.release(discard);
    }
  } });
}

module.exports = { createPostgresObservationStore };
