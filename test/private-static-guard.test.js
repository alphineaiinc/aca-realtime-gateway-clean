"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const guard=require("../src/security/privateStaticGuard");
test("private invoice paths cannot reach public static middleware",()=>{
 function hit(path){let result=200;guard({path},{sendStatus(n){result=n;}},()=>{});return result;}
 for(const p of ["/invoices","/invoices/a.pdf","/%69nvoices/a.pdf","/INVOICES/a.pdf","/x/../invoices/a.pdf","/x/%2e%2e/invoices/a.pdf","/invoices%2fa.pdf"])assert.equal(hit(p),404,p);
 assert.equal(hit("/%ZZ"),400);
 assert.equal(hit("/dashboard/business.html"),200);
});
