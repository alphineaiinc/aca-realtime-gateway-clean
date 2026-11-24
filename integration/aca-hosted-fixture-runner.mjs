// Manual execution only; never run against production or log credentials.
import {randomBytes,createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import pg from 'pg';
const url=process.env.ACA_STAGING_ACCEPTANCE_DATABASE_URL;
if(!url||process.env.ACA_STAGING_ACCEPTANCE_CONFIRM!=='aca_product_staging')throw Error('Explicit staging configuration required');
const parsed=new URL(url);
if(parsed.pathname!=='/aca_product_staging'||decodeURIComponent(parsed.username)!=='aca_staging_owner'||parsed.searchParams.get('sslmode')!=='verify-full')throw Error('Staging owner TLS configuration required');
const pool=new pg.Pool({connectionString:url});
const tag=randomBytes(12).toString('hex'), emails=[], ids=[], codes=[];
try{
 const client=await pool.connect();
 try{
  const check=await client.query('SELECT current_database() AS db,current_user AS role');
  if(check.rows[0].db!=='aca_product_staging'||check.rows[0].role!=='aca_staging_owner')throw Error('Wrong database');
  await client.query('BEGIN');
  for(const suffix of ['a','b']){
   const email='aca-acceptance-'+tag+'-'+suffix+'@example.test';
   const code=randomBytes(32).toString('hex');
   const result=await client.query("INSERT INTO public.master_tenants(business_name,preferred_lang,region) VALUES($1,'en-US','staging') RETURNING id",['Disposable ACA acceptance '+tag+' '+suffix]);
   const id=result.rows[0].id;
   await client.query('INSERT INTO public.aca_business_identities(email,tenant_id,verified_at,is_active) VALUES($1,$2,NOW(),true)',[email,id]);
   await client.query("INSERT INTO public.aca_login_challenges(token_hash,email,expires_at) VALUES($1,$2,NOW()+INTERVAL '5 minutes')",[createHash('sha256').update(code).digest('hex'),email]);
   emails.push(email);ids.push(id);codes.push(code);
  }
  await client.query('COMMIT');
 }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
 const result=spawnSync(process.execPath,[fileURLToPath(new URL('./aca-hosted-authenticated-acceptance.mjs',import.meta.url))],{env:{PATH:process.env.PATH,ACA_ACCEPTANCE_CODE_A:codes[0],ACA_ACCEPTANCE_CODE_B:codes[1],ACA_ACCEPTANCE_TENANT_A:String(ids[0]),ACA_ACCEPTANCE_TENANT_B:String(ids[1])},stdio:'inherit',timeout:180000});
 if(result.status!==0)throw Error('Hosted acceptance failed');
}catch{console.error('Staging acceptance unsuccessful');process.exitCode=1;}
finally{
 try{
  if(emails.length){await pool.query('UPDATE public.aca_business_identities SET is_active=false WHERE email=ANY($1::text[])',[emails]);await pool.query('UPDATE public.aca_login_challenges SET expires_at=NOW() WHERE email=ANY($1::text[])',[emails]);}
 }catch{console.error('Fixture revocation failed; staging owner intervention required');process.exitCode=1;}
 await pool.end();
}
