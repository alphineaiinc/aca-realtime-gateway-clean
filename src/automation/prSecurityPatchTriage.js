"use strict";
/**
 * Conservative PR patch inspection. Security triage only, NEVER an
 * independent approval. No LLM/model, PR instructions or text can grant trust.
 * Findings are descriptive and require separately authenticated disposition.
 */
const crypto=require("node:crypto");
const SHA=/^[a-f0-9]{40}$/;
const POS=n=>Number.isSafeInteger(n)&&n>0;
const RULES=Object.freeze([
 {id:"secret-material",re:/(?:-----BEGIN (?:RSA |EC |OPENSSH |ED25519 )?PRIVATE KEY-----|\b(?:ghp|ghs|ghu|github_pat)_[A-Za-z0-9_]{16,}\b)/i,severity:"critical"},
 {id:"weakened-github-authorization",re:/(?:permissions\s*:\s*(?:write-all|\{[^}]*write)|pull_requests\s*:\s*write|contents\s*:\s*write|(?:enable_auto_merge|merge_pull_request|delete_branch)\s*\()/i,severity:"high"},
 {id:"process-execution",re:/\b(?:child_process|execSync|spawnSync|eval\s*\(|new\s+Function\s*\()/i,severity:"high"},
 {id:"untrusted-network",re:/\b(?:http:\/\/|rejectUnauthorized\s*:\s*false|redirect\s*:\s*["']follow["'])/i,severity:"high"},
 {id:"security-override",re:/\b(?:mergeAuthorized\s*:\s*true|deployAuthorized\s*:\s*true|manualDispatchRequired\s*:\s*false|verify\s*:\s*false)\b/i,severity:"critical"}
]);
const SENSITIVE=/(?:^|\/)(?:\.github\/workflows\/|src\/automation\/|migrations\/|config\/)/;
function inspectPrPatches({repositoryId,prNumber,headSha,files}={}){
 if(!POS(repositoryId)||!POS(prNumber)||!SHA.test(headSha||"")||
    !Array.isArray(files)||files.length===0||files.length>100||
    files.some(f=>!f||typeof f.filename!=="string"||f.filename.length>400||
      !["added","modified","removed","renamed","copied","changed"].includes(f.status)||
      !Number.isSafeInteger(f.changes)||f.changes<0||
      typeof f.patch!=="string"||f.patch.length>120000))
  return Object.freeze({status:"blocked",reason:"incomplete_or_ambiguous_patch_evidence",findings:[],independent:false});
 const findings=[];
 const sorted=[...files].sort((a,b)=>a.filename.localeCompare(b.filename));
 for(const file of sorted){
   const isSensitive=SENSITIVE.test(file.filename);
   // No patch is permitted to be silently omitted, including binary files.
   if(!file.patch.startsWith("@@")&&!file.patch.startsWith("diff ")&&file.status!=="removed"){
      return Object.freeze({status:"blocked",reason:"missing_unified_patch",findings:[],independent:false});
   }
   const added=file.patch.split("\n").filter(l=>l.startsWith("+")&&!l.startsWith("+++")).map(l=>l.slice(1));
   for(const rule of RULES){
     if(added.some(line=>rule.re.test(line)))
       findings.push({file:file.filename,rule:rule.id,severity:rule.severity});
   }
   if(isSensitive)findings.push({file:file.filename,rule:"sensitive_surface_requires_independent_review",severity:"review"});
   if(file.status==="removed")findings.push({file:file.filename,rule:"deletion_requires_review",severity:"review"});
 }
 const digest=crypto.createHash("sha256").update(JSON.stringify(sorted.map(f=>[f.filename,f.status,f.changes,f.patch]))).digest("hex");
 return Object.freeze({status:findings.length?"findings":"manual_review_required",
   reason:"triage_only_no_independent_verdict",repositoryId,prNumber,headSha,
   patchDigest:digest,filesInspected:files.length,findings,independent:false});
}
module.exports={inspectPrPatches,RULES};
