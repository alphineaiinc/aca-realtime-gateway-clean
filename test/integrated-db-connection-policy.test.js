const test=require("node:test");
const assert=require("node:assert/strict");
const {connectionPolicy}=require("../src/db/connectionPolicy");
const ConnectionParameters=require("pg/lib/connection-parameters");
test("remote database TLS cannot be disabled by legacy URL modes",()=>{
 for(const mode of ["disable","prefer","require","verify-ca","verify-full"]){
  const config=connectionPolicy("postgres://u:p@db.example.com/db?sslmode="+mode);
  assert.equal(config.ssl.rejectUnauthorized,true);
  assert.equal(new ConnectionParameters(config).ssl.rejectUnauthorized,true);
 }
});
test("loopback supports isolated local CI; remote overrides fail closed",()=>{
 assert.equal(connectionPolicy("postgres://u:p@127.0.0.1/db").ssl,false);
 assert.equal(connectionPolicy("postgres://u:p@localhost/db?sslmode=require").ssl.rejectUnauthorized,true);
 for(const option of ["host=remote.example.com","ssl=false","sslrootcert=/tmp/cert","uselibpqcompat=true","sslmode=disable&hostaddr=1.2.3.4"]){
  assert.throws(()=>connectionPolicy("postgres://u:p@localhost/db?"+option));
 }
 assert.throws(()=>connectionPolicy("invalid"));
 assert.throws(()=>connectionPolicy(""));
});
