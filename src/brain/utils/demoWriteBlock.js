// src/brain/utils/demoWriteBlock.js
function blockDemoWrites(req, res, next) {
  if (req.role === "demo") {
    return res.status(403).json({ ok: false, error: "Demo mode: write operations disabled" });
  }
  next();
}

module.exports = { blockDemoWrites };
