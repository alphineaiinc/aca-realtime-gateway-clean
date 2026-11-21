"use strict";
/**
 * Unmounted Phase 2A signing keyring. Rotation without global fallback:
 * - Exactly one active signing key by pinned key ID.
 * - Distinct verification keys may overlap for a bounded <=60s drain.
 * - Unknown, revoked, not-yet-valid or expired IDs never verify.
 * - A key ID is a lookup hint, not a trusted authorization claim.
 * Do not load production credentials or generate live keys here.
 */
const {createPrivateKey,createPublicKey,KeyObject}=require("node:crypto");
const ID=/^[a-z][a-z0-9-]{2,63}$/;
const time=x=>Number.isSafeInteger(x)&&x>=0;
function parsedKey(value,type){
 const key=value instanceof KeyObject?value:
  type==="private"?createPrivateKey(value):createPublicKey(value);
 if(key.type!==type||key.asymmetricKeyType!=="ed25519")
  throw Error("invalid_ed25519_key");
 return key;
}
function createOwnerProofKeyring({activeKeyId,signingKeys=[],verificationKeys=[]}={}){
 if(!ID.test(activeKeyId||"")||!Array.isArray(signingKeys)||
    !Array.isArray(verificationKeys)||signingKeys.length!==1||
    verificationKeys.length<1||verificationKeys.length>5)
  throw Error("invalid_owner_keyring");
 const sign=new Map(),verify=new Map();
 for(const entry of signingKeys){
  if(!ID.test(entry?.id||"")||!time(entry.notBefore)||
     !time(entry.notAfter)||entry.notAfter<=entry.notBefore||
     sign.has(entry.id))throw Error("invalid_owner_keyring");
  sign.set(entry.id,{...entry,key:parsedKey(entry.key,"private")});
 }
 for(const entry of verificationKeys){
  if(!ID.test(entry?.id||"")||!time(entry.notBefore)||
     !time(entry.notAfter)||entry.notAfter<=entry.notBefore||
     verify.has(entry.id)||entry.revoked===true)
   throw Error("invalid_owner_keyring");
  verify.set(entry.id,{...entry,key:parsedKey(entry.key,"public")});
 }
 if(!sign.has(activeKeyId)||!verify.has(activeKeyId))
  throw Error("invalid_owner_keyring");
 const active=sign.get(activeKeyId),publicActive=verify.get(activeKeyId);
 if(!active.key.asymmetricKeyType||!publicActive.key.asymmetricKeyType||
    !active.key.equals(require("node:crypto").createPrivateKey(active.key)))
  { /* key type validated above; equality of private/public is tested below */ }
 const {createPublicKey:pub}=require("node:crypto");
 if(!pub(active.key).equals(publicActive.key)||
    active.notBefore!==publicActive.notBefore||
    active.notAfter!==publicActive.notAfter)
  throw Error("invalid_owner_keyring");
 return Object.freeze({
  activeKeyId,
  signingKeyAt(now){
   return time(now)&&now>=active.notBefore&&now<active.notAfter?
    Object.freeze({id:activeKeyId,key:active.key}):null;
  },
  verificationKeyAt(id,issuedAt,now){
   const entry=verify.get(id);
   if(!entry||!time(now)||!time(issuedAt)||
      issuedAt<entry.notBefore||issuedAt>=entry.notAfter||
      now>=entry.notAfter+60000||now<entry.notBefore)return null;
   return entry.key;
  }
 });
}
module.exports={createOwnerProofKeyring};
