const jwt = require("jsonwebtoken");
const pool = require("../db/pool");

async function partnerAuth(req, res, next) {
  try {
    const token = (req.headers.authorization || "").replace("Bearer ", "");
    if (!token) return res.status(401).json({ ok: false, error: "Missing token" });

    // Decode unverified to get partner_id
    const decoded = jwt.decode(token);
    if (!decoded?.partner_id) return res.status(401).json({ ok: false, error: "Invalid token" });

    const { rows } = await pool.query("SELECT jwt_secret FROM partners WHERE id=$1", [decoded.partner_id]);
    if (!rows.length) return res.status(401).json({ ok: false, error: "Partner not found" });

    // Verify signature
    jwt.verify(token, rows[0].jwt_secret);
    req.partner_id = decoded.partner_id;
    next();
  } catch (err) {
    console.error("Partner auth error:", err.message);
    res.status(401).json({ ok: false, error: "Unauthorized" });
  }
}
module.exports = { partnerAuth };
