function connectionPolicy(value) {
  const raw=String(value||"").trim().replace(/^['"]+|['"]+$/g,"");
  if(!raw) throw Error("DATABASE_URL is missing");
  let url;
  try { url=new URL(raw); } catch { throw Error("Invalid DATABASE_URL"); }
  if(!["postgres:","postgresql:"].includes(url.protocol)||!url.hostname) throw Error("Invalid PostgreSQL URL");
  const local=["localhost","127.0.0.1","[::1]"].includes(url.hostname);
  // pg connection-string options can override explicit TLS and host settings.
  for(const key of [...url.searchParams.keys()]) {
    if(!["application_name","connect_timeout","sslmode","channel_binding"].includes(key)) throw Error("Unsupported PostgreSQL URL option");
  }
  const mode=url.searchParams.get("sslmode");
  if(local && (!mode||mode==="disable")) {
    url.searchParams.delete("sslmode");
    return {connectionString:url.toString(),ssl:false};
  }
  url.searchParams.delete("sslmode");
  return {connectionString:url.toString(),ssl:{rejectUnauthorized:true}};
}
module.exports={connectionPolicy};
