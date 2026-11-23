'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const express = require('express');
const Stripe = require('stripe');
const source = fs.readFileSync(path.join(__dirname, '../src/routes/stripeWebhook.js'), 'utf8');

test('Stripe webhook verifies real signatures and never reflects errors or logs recipient addresses', async t => {
  const secret = 'whsec_disposable_test_only';
  const stripe = new Stripe('sk_test_disposable');
  const logs = [];
  const emails = [];
  let failDelivery = false;
  const templates = new Proxy({}, { get: () => () => '<p>test invoice</p>' });
  const context = {
    require(name) {
      if (name === 'express') return express;
      if (name === 'stripe') return Stripe;
      if (name === 'path') return path;
      if (name === 'fs') return { existsSync: () => true, appendFileSync: (_, value) => logs.push(value) };
      if (name.endsWith('/emailer')) return { sendBillingEmail: async (...args) => { if (failDelivery) throw new Error('private delivery failure'); emails.push(args); } };
      if (name.endsWith('/emailTemplates')) return templates;
      throw new Error('Unexpected dependency: ' + name);
    },
    process: { env: { STRIPE_SECRET_KEY: 'sk_test_disposable', STRIPE_WEBHOOK_SECRET: secret } },
    console: { log: (...args) => logs.push(args.join(' ')), error: (...args) => logs.push(args.join(' ')) },
    __dirname: path.join(__dirname, '../src/routes'),
    module: { exports: {} },
  };
  vm.runInNewContext(source, context);
  const app = express();
  app.use(context.module.exports);
  const server = app.listen(0, '127.0.0.1');
  t.after(() => new Promise(resolve => server.close(resolve)));
  await new Promise(resolve => server.once('listening', resolve));
  const url = 'http://127.0.0.1:' + server.address().port + '/webhook';
  const email = 'fixture@example.invalid';
  const payload = JSON.stringify({ id: 'evt_test', type: 'invoice.created', data: { object: { customer_email: email } } });
  const send = signature => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': signature }, body: payload });
  const invalid = await send('<script>alert(1)</script>');
  assert.equal(invalid.status, 400);
  assert.equal(await invalid.text(), 'Webhook signature verification failed');
  assert.equal(emails.length, 0);
  const valid = await send(stripe.webhooks.generateTestHeaderString({ payload, secret }));
  assert.equal(valid.status, 200);
  assert.deepEqual(await valid.json(), { received: true });
  assert.equal(emails.length, 1);
  assert.equal(emails[0][0], email);
  assert.equal(logs.join(' ').includes(email), false);
  assert.equal(logs.join(' ').includes('<script>'), false);
  assert.equal(logs.join(' ').includes(secret), false);
  const duplicate = await send(stripe.webhooks.generateTestHeaderString({ payload, secret }));
  assert.equal(duplicate.status, 200);
  assert.equal(emails.length, 1);
  const retryPayload = JSON.stringify({ id: 'evt_retry', type: 'invoice.created', data: { object: { customer_email: email } } });
  const retry = () => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': stripe.webhooks.generateTestHeaderString({ payload: retryPayload, secret }) }, body: retryPayload });
  failDelivery = true;
  const failed = await retry();
  assert.equal(failed.status, 503);
  assert.equal(await failed.text(), 'Webhook processing failed');
  failDelivery = false;
  assert.equal((await retry()).status, 200);
  assert.equal(emails.length, 2);
  assert.equal(logs.join(' ').includes('private delivery failure'), false);
});

test('durable Stripe HTTP path suppresses completed and uncertain deliveries', async t => {
  const secret = 'whsec_disposable_test_only';
  const stripe = new Stripe('sk_test_disposable');
  const logs = [];
  const emails = [];
  let failDelivery = false;
  const states = new Map();
  const receipts = {
    async claim(id) { if (states.has(id)) return {status: states.get(id)==='completed'?'completed':'blocked'}; states.set(id,'processing'); return {status:'claimed',claimId:'owner'}; },
    async finish(id, owner, state) { assert.equal(owner,'owner'); states.set(id,state); }
  };
  const templates = new Proxy({}, { get: () => () => '<p>test invoice</p>' });
  const context = {
    require(name) {
      if (name === 'express') return express;
      if (name === 'stripe') return Stripe;
      if (name === 'path') return path;
      if (name === 'fs') return { existsSync: () => true, appendFileSync: (_, value) => logs.push(value) };
      if (name.endsWith('/emailer')) return { sendBillingEmail: async (...args) => { if (failDelivery) throw new Error('private delivery failure'); emails.push(args); } };
      if (name.endsWith('/emailTemplates')) return templates;
      if (name.endsWith('/stripeEventReceipt')) return {createStripeEventReceiptStore:()=>receipts};
      if (name.endsWith('/durableStripeProcessor')) return require('../src/security/durableStripeProcessor');
      if (name.endsWith('/db/pool')) return {};
      throw new Error('Unexpected dependency: ' + name);
    },
    process: { env: { STRIPE_SECRET_KEY: 'sk_test_disposable', STRIPE_WEBHOOK_SECRET: secret, STRIPE_DURABLE_RECEIPTS: '1' } },
    console: { log: (...args) => logs.push(args.join(' ')), error: (...args) => logs.push(args.join(' ')) },
    __dirname: path.join(__dirname, '../src/routes'),
    module: { exports: {} },
  };
  vm.runInNewContext(source, context);
  const app = express();
  app.use(context.module.exports);
  const server = app.listen(0, '127.0.0.1');
  t.after(() => new Promise(resolve => server.close(resolve)));
  await new Promise(resolve => server.once('listening', resolve));
  const url = 'http://127.0.0.1:' + server.address().port + '/webhook';
  const email = 'fixture@example.invalid';
  const payload = JSON.stringify({ id: 'evt_test', type: 'invoice.created', data: { object: { customer_email: email } } });
  const send = signature => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': signature }, body: payload });
  const invalid = await send('<script>alert(1)</script>');
  assert.equal(invalid.status, 400);
  assert.equal(await invalid.text(), 'Webhook signature verification failed');
  assert.equal(emails.length, 0);
  const valid = await send(stripe.webhooks.generateTestHeaderString({ payload, secret }));
  assert.equal(valid.status, 200);
  assert.deepEqual(await valid.json(), { received: true });
  assert.equal(emails.length, 1);
  assert.equal(emails[0][0], email);
  assert.equal(emails[0][4].singleAttempt, true);
  assert.equal(logs.join(' ').includes(email), false);
  assert.equal(logs.join(' ').includes('<script>'), false);
  assert.equal(logs.join(' ').includes(secret), false);
  const duplicate = await send(stripe.webhooks.generateTestHeaderString({ payload, secret }));
  assert.equal(duplicate.status, 200);
  assert.equal(emails.length, 1);
  const retryPayload = JSON.stringify({ id: 'evt_retry', type: 'invoice.created', data: { object: { customer_email: email } } });
  const retry = () => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': stripe.webhooks.generateTestHeaderString({ payload: retryPayload, secret }) }, body: retryPayload });
  failDelivery = true;
  const failed = await retry();
  assert.equal(failed.status, 503);
  assert.equal(await failed.text(), 'Webhook temporarily unavailable');
  failDelivery = false;
  assert.equal((await retry()).status, 503);
  assert.equal(states.get('evt_retry'), 'uncertain');
  assert.equal(emails.length, 1);
  assert.equal(logs.join(' ').includes('private delivery failure'), false);
});
