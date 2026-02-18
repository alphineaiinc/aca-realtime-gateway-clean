const fs = require("fs");
const path = require("path");

const root = process.cwd();
const skip = new Set(["node_modules", ".git"]);
const reqs = new Set();

function addReq(r) {
  if (!r) return;
  if (r.startsWith(".") || r.startsWith("/") || r.includes(":")) return;
  // keep scoped packages @scope/name as a unit
  if (r.startsWith("@")) {
    const parts = r.split("/");
    if (parts.length >= 2) reqs.add(parts.slice(0, 2).join("/"));
    return;
  }
  reqs.add(r.split("/")[0]);
}

function walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skip.has(ent.name)) continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      walk(p);
    } else if (p.endsWith(".js")) {
      const s = fs.readFileSync(p, "utf8");

      // Match require("x") or require('x') only
      const re = /require\(\s*['"]([^'"]+)['"]\s*\)/g;
      let m;
      while ((m = re.exec(s)) !== null) addReq(m[1]);
    }
  }
}

walk(root);
console.log(Array.from(reqs).sort().join(" "));