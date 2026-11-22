"use strict";
/**
 * Server-side PostgreSQL OAuth backing store. Isolated staging only.
 * Requires a dedicated, pre-provisioned PostgreSQL role and a separate
 * 32-byte encryption key supplied securely to the calling server.
 * No connections, migrations, runtime routes or credentials on import.
 */
const {randomBytes,createCipheriv,createDecipheriv}=require("node:crypto");
const HASH=/^[a-f0-9]{64}$/;
const positive=x=>Number.isSafeInteger(x)&&x>0;
const instant=x=>Number.isSafeInteger(x)&&x>=0;
function date(x){return new Date(x);}
function encode(key,digest,value){
 const iv=randomBytes(12);
 const cipher=createCipheriv("aes-256-gcm",key,iv);
 cipher.setAAD(Buffer.from(digest));
 const ct=Buffer.concat([cipher.update(value,"utf8"),cipher.final()]);
 return Buffer.concat([iv,cipher.getAuthTag(),ct]).toString("base64");
}
function decode(key,digest,encoded){
 const b=Buffer.from(encoded,"base64");
 if(b.length<29||b.length>1024)throw Error("invalid_encrypted_state");
 const d=createDecipheriv("aes-256-gcm",key,b.subarray(0,12));
 d.setAAD(Buffer.from(digest));d.setAuthTag(b.subarray(12,28));
 return Buffer.concat([d.update(b.subarray(28)),d.final()]).toString("utf8");
}
function createPostgresOAuthStore({pool,encryptionKey}={}){
 if(typeof pool?.query!=="function"||
    !Buffer.isBuffer(encryptionKey)||encryptionKey.length!==32)
  throw Error("invalid_oauth_store_configuration");
 const key=Buffer.from(encryptionKey);
 return Object.freeze({
  async putPending(x){
   if(!HASH.test(x?.digest||"")||!HASH.test(x?.stateDigest||"")||
      typeof x.verifier!=="string"||!/^[A-Za-z0-9_-]{40,160}$/.test(x.verifier)||
      !instant(x.createdAt)||!instant(x.expiresAt)||
      x.expiresAt<=x.createdAt||x.expiresAt-x.createdAt>300000)return false;
   const secured=encode(key,x.digest,x.verifier);
   const q=await pool.query(`INSERT INTO aca_automation.owner_oauth_pending
    (digest,state_digest,encrypted_verifier,created_at,expires_at)
    VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING digest`,
    [x.digest,x.stateDigest,secured,date(x.createdAt),date(x.expiresAt)]);
   return q.rowCount===1;
  },
  async consumePending(digest){
   if(!HASH.test(digest||""))return null;
   // Atomic DELETE RETURNING: under contention exactly one caller obtains
   // the verifier, and failed state checks cannot replay it.
   const q=await pool.query(`DELETE FROM aca_automation.owner_oauth_pending
    WHERE digest=$1 AND expires_at>now()
    RETURNING digest,state_digest,encrypted_verifier,created_at,expires_at`,
    [digest]);
   if(q.rowCount!==1)return null;
   const r=q.rows[0];
   return {digest:r.digest,stateDigest:r.state_digest,
    verifier:decode(key,digest,r.encrypted_verifier),
    createdAt:new Date(r.created_at).getTime(),
    expiresAt:new Date(r.expires_at).getTime()};
  },
  async putSession(x){
   if(!HASH.test(x?.digest||"")||!HASH.test(x?.csrfDigest||"")||
      !positive(x.ownerId)||!instant(x.createdAt)||!instant(x.expiresAt)||
      x.expiresAt<=x.createdAt||x.expiresAt-x.createdAt>900000)return false;
   const q=await pool.query(`INSERT INTO aca_automation.owner_oauth_sessions
    (digest,owner_id,csrf_digest,created_at,expires_at)
    VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING digest`,
    [x.digest,x.ownerId,x.csrfDigest,date(x.createdAt),date(x.expiresAt)]);
   return q.rowCount===1;
  },
  async getSession(digest){
   if(!HASH.test(digest||""))return null;
   const q=await pool.query(`SELECT owner_id,csrf_digest,created_at,expires_at
    FROM aca_automation.owner_oauth_sessions
    WHERE digest=$1 AND expires_at>now()`,[digest]);
   if(q.rowCount!==1)return null;
   const r=q.rows[0];
   return {ownerId:Number(r.owner_id),csrfDigest:r.csrf_digest,
    createdAt:new Date(r.created_at).getTime(),
    expiresAt:new Date(r.expires_at).getTime()};
  },
  async revokeSession(digest){
   if(!HASH.test(digest||""))return false;
   const q=await pool.query("DELETE FROM aca_automation.owner_oauth_sessions WHERE digest=$1",[digest]);
   return q.rowCount===1;
  }
 });
}
module.exports={createPostgresOAuthStore};
