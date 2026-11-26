"use strict";
/**
 * Load GitHub App authentication key only from a pinned Render secret file.
 * No env key fallback, no arbitrary caller-supplied paths, no logging.
 */
const fs=require("node:fs");
const {createPrivateKey}=require("node:crypto");
const PATH="/etc/secrets/github-reviewer-app.pem";
function readReviewerGithubAppKey(env=process.env,{readFileSync=fs.readFileSync}={}){
 if(!env||typeof env!=="object"||
  env.ACA_REVIEW_GITHUB_APP_PRIVATE_KEY_PATH!==PATH||
  typeof readFileSync!=="function")
  throw Error("github_app_secret_file_not_configured");
 let key;
 try{
  key=readFileSync(PATH,{encoding:"utf8",flag:"r"});
 }catch{throw Error("github_app_secret_file_unavailable");}
 if(typeof key!=="string"||Buffer.byteLength(key,"utf8")>16384||
  Buffer.byteLength(key,"utf8")<100||
  !/^-----BEGIN (?:RSA )?PRIVATE KEY-----\r?\n/.test(key)||
  !/-----END (?:RSA )?PRIVATE KEY-----\s*$/.test(key))
  throw Error("github_app_secret_file_invalid");
 return key;
}
module.exports={readReviewerGithubAppKey,REVIEWER_GITHUB_APP_SECRET_PATH:PATH};
