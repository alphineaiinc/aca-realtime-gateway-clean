"use strict";
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");
function isolated(relative, mocks = {}, env = {}) {
  const filename = path.join(__dirname, "../..", relative);
  const real = createRequire(filename);
  const req = (name) => Object.hasOwn(mocks, name) ? mocks[name] : real(name);
  req.resolve = real.resolve;
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, "utf8"), { require: req, module, exports: module.exports,
    __dirname: path.dirname(filename), __filename: filename, process: { env }, console,
    Buffer, setTimeout, clearTimeout, setInterval, clearInterval, Date, Set, Map, URL, URLSearchParams }, { filename });
  return module.exports;
}
function capture(t) {
  const records = [];
  for (const level of ["log", "warn", "error"]) {
    const original = console[level]; console[level] = (...args) => records.push({ level, args });
    t.after(() => { console[level] = original; });
  }
  return records;
}
module.exports = { isolated, capture };
