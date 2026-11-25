// Manual execution only; never run against production or log credentials.
import {randomBytes,createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import pg from 'pg';
const url=process.env.ACA_STAGING_ACCEPTANCE_DATABASE_URL;
if(!url||process.env.ACA_STAGING_ACCEPTANCE_CONFIRM!=='aca_product_staging')throw Error('Explicit staging configuration required');
const parsed=new URL(url);
if(parsed.pathname!=='/aca_product_staging'||decodeURIComponent(parsed.username)!=='aca_product_acceptance'||parsed.searchParams.get('sslmode')!=='verify-full')throw Error('Restricted staging TLS configuration required');
const pool=new pg.Pool({connectionString:url});
const tag=randomBytes(12).toString('hex'), ids=[], codes=[];
let committed=false;
try{
 const client=await pool.connect();
 try{
  const check=await client.query('SELECT current_database() AS db,current_user AS role');
  if(check.rows[0].db!=='aca_product_staging'||check.rows[0].role!=='aca_product_acceptance')throw Error('Wrong database');
  await client.query('BEGIN');
  for(const suffix of ['a','b']){
   const code=randomBytes(32).toString('hex');
   const result=await client.query('SELECT public.aca_acceptance_create($1,$2,$3) AS id',[tag,suffix,createHash('sha256').update(code).digest('hex')]);
   ids.push(result.rows[0].id);codes.push(code);
  }
  await client.query('COMMIT');committed=true;
 }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
 const result=spawnSync(process.execPath,[fileURLToPath(new URL('./aca-hosted-authenticated-acceptance.mjs',import.meta.url))],{env:{PATH:process.env.PATH,ACA_ACCEPTANCE_CODE_A:codes[0],ACA_ACCEPTANCE_CODE_B:codes[1],ACA_ACCEPTANCE_TENANT_A:String(ids[0]),ACA_ACCEPTANCE_TENANT_B:String(ids[1])},stdio:'inherit',timeout:180000});
 if(result.status!==0)throw Error('Hosted acceptance failed');
}catch{console.error('Staging acceptance unsuccessful');process.exitCode=1;}
finally{
 try{
  if(committed)await pool.query('SELECT public.aca_acceptance_revoke($1)',[tag]);
 }catch{console.error('Fixture revocation failed; staging owner intervention required');process.exitCode=1;}
 await pool.end();
}
