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
// GitHub can truncate a nonempty patch. Require every hunk's line counts.
function completeUnifiedHunks(patch){
 if(typeof patch!=="string"||!patch.startsWith("@@"))return false;
 const lines=patch.split("\n");
 let oldRemaining=0,newRemaining=0,seen=false;
 for(let i=0;i<lines.length;i++){
   const line=lines[i];
   if(line.startsWith("@@")){
     if(seen&&(oldRemaining!==0||newRemaining!==0))return false;
     const match=/^@@ -(?:0|[1-9]\d*)(?:,(\d+))? \+(?:0|[1-9]\d*)(?:,(\d+))? @@(?: |$)/.exec(line);
     if(!match)return false;
     oldRemaining=match[1]===undefined?1:Number(match[1]);
     newRemaining=match[2]===undefined?1:Number(match[2]);
     if(!Number.isSafeInteger(oldRemaining)||!Number.isSafeInteger(newRemaining))return false;
     seen=true;
   }else if(line.startsWith("\\ No newline at end of file")){
     if(!seen)return false;
   }else if(line.length===0){
     if(i!==lines.length-1)return false;
   }else if(line.startsWith("+"))newRemaining--;
   else if(line.startsWith("-"))oldRemaining--;
   else if(line.startsWith(" ")){oldRemaining--;newRemaining--;}
   else return false;
   if(oldRemaining<0||newRemaining<0)return false;
 }
 return seen&&oldRemaining===0&&newRemaining===0;
}
function changedLineTotals(patch){
 let additions=0,deletions=0;
 for(const line of patch.split("\\n")){
  if(line.startsWith("+"))additions++;
  else if(line.startsWith("-"))deletions++;
 }
 return {additions,deletions};
}
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
   if(!file.patch&&file.status==="removed"){
     findings.push({file:file.filename,rule:"deletion_without_patch_requires_review",severity:"review"});
     continue;
   }
   if(!completeUnifiedHunks(file.patch)){
      return Object.freeze({status:"blocked",reason:"incomplete_unified_patch",findings:[],independent:false});
   }
   const totals=changedLineTotals(file.patch);
   if(totals.additions+totals.deletions!==file.changes||
      (Number.isSafeInteger(file.additions)&&file.additions!==totals.additions)||
      (Number.isSafeInteger(file.deletions)&&file.deletions!==totals.deletions))
     return Object.freeze({status:"blocked",reason:"patch_change_count_mismatch",findings:[],independent:false});
   const added=file.patch.split("\n").filter(l=>l.startsWith("+")).map(l=>l.slice(1));
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
module.exports={inspectPrPatches,completeUnifiedHunks,changedLineTotals,RULES};
