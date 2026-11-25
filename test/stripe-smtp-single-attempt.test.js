'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
test('SMTP single-attempt mode does not resend ambiguous delivery and logs no private data', async () => {
  let attempts=0, config;
  const logs=[];
  const module={exports:{}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/brain/utils/emailer.js'),'utf8'),{
    module, __dirname:'/mock', process:{env:{}},
    require(name) {
      if(name==='nodemailer') return {createTransport(c){config=c;return {async sendMail(){attempts++;throw new Error('private smtp detail');}};}};
      if(name==='fs') return {existsSync:()=>true,appendFileSync:(p,s)=>logs.push(s)};
      if(name==='path') return path;
      throw new Error('Unexpected module');
    }
  });
  assert.equal(config.tls.rejectUnauthorized,true);
  await assert.rejects(module.exports.sendBillingEmail('private@example.com','private subject','html','text',{singleAttempt:true}));
  assert.equal(attempts,1);
  await assert.rejects(module.exports.sendBillingEmail('private@example.com','private subject','html','text'));
  assert.equal(attempts,4);
  assert.ok(!logs.join(' ').includes('private'));
});
