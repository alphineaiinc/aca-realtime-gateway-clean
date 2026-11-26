'use strict';
const {createHash}=require('node:crypto');
const digest=text=>createHash('sha256').update(text,'utf8').digest('hex');
const safePath=p=>typeof p==='string'&&p.length<=200&&/^(src|test)\/[A-Za-z0-9_/-][A-Za-z0-9_.\/-]*\.js$/.test(p)&&p.split('/').every(s=>s&&s!=='.'&&s!=='..'&&!s.startsWith('.'));
function createPatchPlanner({scope,files}={}){
 if(!scope||typeof scope.product!=='string'||typeof scope.repository!=='string'||! /^[a-f0-9]{40}$/.test(scope.sha)||!Array.isArray(files)||!files.length||files.length>20)throw Error('Invalid patch scope');
 const pinned=Object.freeze({product:scope.product,repository:scope.repository,sha:scope.sha});
 const inventory=new Map();
 for(const f of files){
  if(!safePath(f.path)||inventory.has(f.path)||!['backend-developer','frontend-developer'].includes(f.role)||typeof f.text!=='string'||Buffer.byteLength(f.text)>16000)throw Error('Invalid patch inventory');
  inventory.set(f.path,Object.freeze({role:f.role,text:f.text,sha256:digest(f.text)}));
 }
 function plan({role,edits}){
  if(!['backend-developer','frontend-developer'].includes(role)||!Array.isArray(edits)||!edits.length||edits.length>4)throw Error('Invalid patch request');
  let bytes=0;const seen=new Set(),changes=[];
  for(const e of edits){
   if(!e||Object.keys(e).length!==3||!Object.hasOwn(e,'path')||!Object.hasOwn(e,'beforeSha256')||!Object.hasOwn(e,'replacement'))throw Error('Invalid edit');
   const old=inventory.get(e.path);
   if(!old||old.role!==role||seen.has(e.path)||e.beforeSha256!==old.sha256||typeof e.replacement!=='string'||!e.replacement.trim()||e.replacement===old.text||e.replacement.includes('\0'))throw Error('Edit denied');
   bytes+=Buffer.byteLength(e.replacement);if(bytes>32000||Buffer.byteLength(e.replacement)>16000)throw Error('Patch too large');
   seen.add(e.path);
   changes.push(Object.freeze({path:e.path,beforeSha256:old.sha256,afterSha256:digest(e.replacement),replacement:e.replacement}));
  }
  const payload={scope:pinned,role,changes:Object.freeze(changes)};
  return Object.freeze({...payload,evidenceSha256:digest(JSON.stringify(payload)),executionAuthorized:false});
 }
 return Object.freeze({plan});
}
module.exports={createPatchPlanner,digest};
