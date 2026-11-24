const test=require('node:test');
const assert=require('node:assert/strict');
const {createPartnerReservation}=require('../src/security/partnerReservation');
test('reservation retries cannot debit twice or change amount',async()=>{
 let prior=false;let debits=0;
 const reserve=createPartnerReservation({connect:async()=>({release(){},query:async(sql)=>{
 if(sql.startsWith('SELECT available'))return {rowCount:1};
 if(sql.startsWith('SELECT amount'))return {rowCount:prior?1:0,rows:[{amount_cents:'500'}]};
 if(sql.startsWith('UPDATE')){debits++;return {rowCount:1};}
 if(sql.startsWith('INSERT'))prior=true;
 return {rowCount:0};
 }})});
 assert.equal(await reserve(1,'fixture_request_01',500),'reserved');
 assert.equal(await reserve(1,'fixture_request_01',500),'duplicate');
 await assert.rejects(reserve(1,'fixture_request_01',501));assert.equal(debits,1);
});
