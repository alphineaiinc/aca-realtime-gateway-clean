'use strict';
function createArtifactDownloader({repository,token,fetchImpl=globalThis.fetch,artifactHost}={}){
 if(!/^[A-Za-z0-9_-][A-Za-z0-9_.-]*\/[A-Za-z0-9_-][A-Za-z0-9_.-]*$/.test(repository)||typeof token!=='string'||!token||/[\r\n]/.test(token)||typeof artifactHost!=='string'||! /^[a-z0-9.-]+$/.test(artifactHost)||!artifactHost.endsWith('.blob.core.windows.net'))throw Error('Invalid artifact host configuration');
 return async function download(s){
  if(s.repository!==repository||!Number.isSafeInteger(s.artifactId)||s.artifactId<1||!Number.isSafeInteger(s.maxBytes)||s.maxBytes<1||s.maxBytes>8388608)throw Error('Artifact scope denied');
  const signal=AbortSignal.timeout(15000);
  const first=await fetchImpl('https://api.github.com/repos/'+repository+'/actions/artifacts/'+s.artifactId+'/zip',{redirect:'manual',signal,headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json'}});
  if(first.status!==302)throw Error('Artifact redirect denied');
  const url=new URL(first.headers.get('location'));
  if(url.protocol!=='https:'||url.hostname!==artifactHost||url.port||url.username||url.password)throw Error('Artifact origin denied');
  const response=await fetchImpl(url.href,{redirect:'error',signal});
  if(!response.ok||!response.body)throw Error('Artifact read denied');
  const reader=response.body.getReader(),chunks=[];let size=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>s.maxBytes)throw Error('Artifact limit');chunks.push(Buffer.from(value));}}finally{await reader.cancel().catch(()=>{});}
  return Buffer.concat(chunks);
 };
}
module.exports={createArtifactDownloader};
