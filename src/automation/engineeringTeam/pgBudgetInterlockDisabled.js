'use strict';
// Schema declaration only; never applied by this module.
const schemaSQL='CREATE TABLE da_budget_interlock_disabled (singleton boolean PRIMARY KEY CHECK(singleton), version bigint NOT NULL CHECK(version>=0), pending text);';
function createPgInterlockStore(pool){
 if(typeof pool?.query!=='function')throw Error('Missing database');
 return Object.freeze({async read(){
 const r=await pool.query('SELECT version,pending FROM da_budget_interlock_disabled WHERE singleton=true');
 if(r.rowCount!==1)throw Error('Missing interlock');
 const version=Number(r.rows[0].version);if(!Number.isSafeInteger(version)||version<0)throw Error('Invalid version');
 return {version,pending:r.rows[0].pending};
 },async compareAndSet(a,b){
 if(!Number.isSafeInteger(a.version)||!Number.isSafeInteger(b.version)||b.version!==a.version+1)throw Error('Invalid transition');
 const r=await pool.query('UPDATE da_budget_interlock_disabled SET version=$1,pending=$2 WHERE singleton=true AND version=$3 AND pending IS NOT DISTINCT FROM $4',[b.version,b.pending,a.version,a.pending]);
 return r.rowCount===1;
 }});
}
module.exports={createPgInterlockStore,schemaSQL};
