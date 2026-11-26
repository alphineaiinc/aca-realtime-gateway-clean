import {pathToFileURL} from "node:url";
export async function verifyRevision(expected,fetcher=fetch){
 if(!/^[a-f0-9]{40}$/.test(expected||""))throw Error("Expected exact SHA required");
 const r=await fetcher("https://alphine-aca-product-staging.onrender.com/health",{redirect:"error",cache:"no-store",signal:AbortSignal.timeout(15000)});
 if(r.status!==200)throw Error("Staging health unavailable");
 const body=await r.json();
 if(body.ok!==true||body.service!=="ACA-Orchestrator"||body.revision!==expected)throw Error("Staging revision mismatch");
 return true;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){await verifyRevision(process.env.ACA_EXPECTED_REVISION);console.log("Exact staging revision verified");}
