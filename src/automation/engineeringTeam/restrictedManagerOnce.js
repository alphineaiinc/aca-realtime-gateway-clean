'use strict';
const {createRestrictedManagerRuntime}=require('./restrictedManagerRuntime');
// One bounded observation, no polling, no scheduling, no writes.
// Trusted host configuration only. Do not invoke on an unreviewed runtime.
async function observeOnce({env={},fetchImpl,readStopState}={}){
 if(env.ACA_RESTRICTED_MANAGER_ENABLED!=='true')throw Error('Restricted manager disabled');
 const issue=Number(env.ACA_RESTRICTED_MANAGER_ISSUE);
 if(!/^[1-9][0-9]*$/.test(env.ACA_RESTRICTED_MANAGER_ISSUE||'')||!Number.isSafeInteger(issue))throw Error('Invalid issue configuration');
 const scope={product:env.ACA_RESTRICTED_MANAGER_PRODUCT,repository:env.ACA_RESTRICTED_MANAGER_REPOSITORY,sha:env.ACA_RESTRICTED_MANAGER_HEAD_SHA};
 const runtime=createRestrictedManagerRuntime({scope,issue,githubToken:env.ACA_RESTRICTED_MANAGER_GITHUB_READ_TOKEN,fetchImpl,readStopState});
 return runtime.observe();
}
module.exports={observeOnce};
