const {Pool}=require("pg");
require("dotenv").config({path:require("path").resolve(__dirname,"../../.env")});
const {connectionPolicy}=require("./connectionPolicy");
console.log("DATABASE_URL configured:", Boolean(process.env.DATABASE_URL));
const pool=new Pool({...connectionPolicy(process.env.DATABASE_URL),max:10,idleTimeoutMillis:30000,connectionTimeoutMillis:10000});
(async()=>{
  let client;
  try {
    client=await pool.connect();
    await client.query("SELECT 1");
    console.log("Database startup connection succeeded");
  } catch {
    console.error("Database startup connection failed");
  } finally { if(client) client.release(); }
})();
pool.on("error",()=>{console.error("Unexpected database pool error");process.exit(1);});
module.exports=pool;
