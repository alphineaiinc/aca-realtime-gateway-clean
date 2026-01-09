const jwt = require("jsonwebtoken");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, ".env"), override: true });

const token = process.argv[2] || "";
if (!token) {
  console.log("Usage: node verify_jwt_local.js <JWT>");
  process.exit(1);
}

try {
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  console.log("✅ JWT OK. Decoded payload:", decoded);
} catch (e) {
  console.error("❌ JWT verify failed:", e.message);
  console.error("JWT_SECRET loaded?", !!process.env.JWT_SECRET);
  console.error("JWT_SECRET value (length):", (process.env.JWT_SECRET || "").length);
}
