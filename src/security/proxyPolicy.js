"use strict";
const {BlockList,isIP}=require("node:net");
function proxyPolicy(value=""){
 const list=new BlockList();
 for(const item of value.split(",").map(s=>s.trim()).filter(Boolean)){
  const parts=item.split("/");
  const family=isIP(parts[0]);
  if(parts.length!==2||!family||!/^\d+$/.test(parts[1]))throw new Error("Invalid trusted proxy CIDR");
  const prefix=Number(parts[1]);
  if(prefix<1||prefix>(family===4?32:128))throw new Error("Invalid trusted proxy prefix");
  list.addSubnet(parts[0],prefix,family===4?"ipv4":"ipv6");
 }
 return address=>{const family=isIP(address);return !!family&&list.check(address,family===4?"ipv4":"ipv6");};
}
module.exports={proxyPolicy};
