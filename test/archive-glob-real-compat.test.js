"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs/promises");
const os=require("node:os");
const path=require("node:path");
const {createRequire}=require("node:module");
const {finished}=require("node:stream/promises");
const {Writable}=require("node:stream");
test("real archive and glob filtering preserve nested invoice selection",{timeout:10000},async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),"aca-archive-"));
 try {
  await fs.mkdir(path.join(dir,"nested"));
  await fs.mkdir(path.join(dir,"skip"));
  for(const file of ["invoice.pdf","nested/second.pdf","nested/ignore.pdf","skip/hidden.pdf",".private.pdf","notes.txt"]) await fs.writeFile(path.join(dir,file),"fixture");
  const mod=await import("archiver");
  const archiveRequire=createRequire(require.resolve("archiver"));
  const globMod=archiveRequire("readdir-glob");
  const glob=globMod.readdirGlob||globMod.default||globMod;
  const matches=await new Promise((resolve,reject)=>glob(dir,{pattern:"**/*.pdf",ignore:"**/ignore.pdf",skip:"skip",nodir:true},(err,files)=>err?reject(err):resolve(files)));
  assert.deepEqual([...matches].sort(),["invoice.pdf","nested/second.pdf"]);
  const archive=typeof mod.default==="function"?mod.default("zip"):new mod.ZipArchive();
  const chunks=[];const entries=[];
  archive.on("entry",entry=>entries.push(entry.name));
  const sink=new Writable({write(chunk,encoding,cb){chunks.push(Buffer.from(chunk));cb();}});
  archive.on("error",err=>sink.destroy(err));
  archive.pipe(sink);
  archive.glob("**/*.pdf",{cwd:dir,ignore:["**/ignore.pdf","skip/**"],dot:false});
  await Promise.all([archive.finalize(),finished(sink)]);
  assert.deepEqual(entries.sort(),["invoice.pdf","nested/second.pdf"]);
  assert.equal(Buffer.concat(chunks).readUInt32LE(0),0x04034b50);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
