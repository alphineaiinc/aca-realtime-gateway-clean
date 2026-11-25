"use strict";

const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");
const { test } = require("node:test");

const billingPath = require.resolve("../src/routes/billing");

function loadBillingRouterWithMocks({ fsMock, verify, createArchive }) {
  const originalLoad = Module._load;
  const jwtMock = {
    verify: verify || (() => ({ tenant_id: "tenant-default", partner_id: "partner-default" })),
  };
  const poolMock = { query: async () => ({ rowCount: 0, rows: [] }) };
  const billingEngineMock = { generateInvoice: async () => ({}) };
  const paymentLoggerMock = { logPayment: () => {} };

  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === "jsonwebtoken") return jwtMock;
    if (request === "../db/pool") return poolMock;
    if (request === "../brain/billingEngine") return billingEngineMock;
    if (request === "../brain/utils/paymentLogger") return paymentLoggerMock;
    if (request === "fs") return fsMock;
    if (request === "archiver") return createArchive;
    return originalLoad(request, parent, isMain);
  };

  delete require.cache[billingPath];
  try {
    return require(billingPath);
  } finally {
    Module._load = originalLoad;
  }
}

function getDownloadAllHandlers(router) {
  const layer = router.stack.find((entry) => entry.route && entry.route.path === "/download-all");
  assert.ok(layer, "download-all route must exist");
  assert.equal(layer.route.stack.length, 2, "download-all route expected auth + handler");
  return {
    authenticate: layer.route.stack[0].handle,
    handle: layer.route.stack[1].handle,
  };
}

function createResponseRecorder() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    ended: false,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    end() {
      this.ended = true;
      return this;
    },
  };
}

test("billing download-all remains compatible with archiver v8 API", async () => {
  const archiverCalls = [];
  const directoryCalls = [];
  let finalized = false;
  const archive = {
    on: () => archive,
    pipe: () => archive,
    directory: (...args) => {
      directoryCalls.push(args);
      return archive;
    },
    finalize: async () => {
      finalized = true;
    },
  };
  const router = loadBillingRouterWithMocks({
    fsMock: {
      existsSync: () => true,
      mkdirSync: () => {},
    },
    verify: () => ({ tenant_id: "tenant-123", partner_id: "partner-123" }),
    createArchive: (...args) => {
      archiverCalls.push(args);
      return archive;
    },
  });
  const { authenticate, handle } = getDownloadAllHandlers(router);
  const req = { headers: { authorization: "Bearer synthetic" } };
  const res = createResponseRecorder();

  await new Promise((resolve, reject) => {
    authenticate(req, res, (err) => (err ? reject(err) : resolve()));
  });
  await handle(req, res);

  assert.deepEqual(archiverCalls, [["zip", { zlib: { level: 9 } }]]);
  assert.equal(directoryCalls.length, 1);
  assert.equal(directoryCalls[0][1], false);
  assert.ok(directoryCalls[0][0].endsWith(path.join("public", "invoices", "tenant-123")));
  assert.equal(finalized, true);
  assert.equal(res.headers["Content-Type"], "application/zip");
  assert.match(res.headers["Content-Disposition"], /invoices_tenant_tenant-123_/);
});

test("billing download-all preserves archive error handling", async () => {
  let errorHandler;
  const archive = {
    on: (event, cb) => {
      if (event === "error") errorHandler = cb;
      return archive;
    },
    pipe: () => archive,
    directory: () => archive,
    finalize: async () => {
      errorHandler(new Error("synthetic archive failure"));
    },
  };
  const router = loadBillingRouterWithMocks({
    fsMock: {
      existsSync: () => true,
      mkdirSync: () => {},
    },
    verify: () => ({ tenant_id: "tenant-123", partner_id: "partner-123" }),
    createArchive: () => archive,
  });
  const { authenticate, handle } = getDownloadAllHandlers(router);
  const req = { headers: { authorization: "Bearer synthetic" } };
  const res = createResponseRecorder();

  await new Promise((resolve, reject) => {
    authenticate(req, res, (err) => (err ? reject(err) : resolve()));
  });
  await handle(req, res);

  assert.equal(res.statusCode, 500);
  assert.equal(res.ended, true);
});
