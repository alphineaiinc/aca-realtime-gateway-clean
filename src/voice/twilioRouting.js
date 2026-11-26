"use strict";
const crypto = require("node:crypto");
const { logEvent } = require("./voiceLogger");
const twilio = require("twilio");
const { isValidatedRoutingContext } = require("./tenantResolver");
const hash = (token) => crypto.createHash("sha256").update(token).digest("hex");
const sid = (value, prefix) => typeof value === "string" && new RegExp(`^${prefix}[a-fA-F0-9]{32}$`).test(value);
function createTwilioRouting({ query, resolve, env = process.env }) {
  // Separate encryption key/domain from Twilio's request-signature computation.
  function tokenKey() {
    return crypto.hkdfSync("sha256", env.TWILIO_AUTH_TOKEN, "aca-029", "stream-token-retry-v1", 32);
  }
  function seal(token) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", tokenKey(), iv);
    const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64url");
  }
  function open(envelope) {
    const bytes = Buffer.from(envelope, "base64url");
    if (bytes.length !== 71) throw new Error("INVALID_GRANT");
    const decipher = crypto.createDecipheriv("aes-256-gcm", tokenKey(), bytes.subarray(0, 12));
    decipher.setAuthTag(bytes.subarray(12, 28));
    return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString("utf8");
  }
  function callbackUrl(kind) {
    const suffix = kind === "status" ? "/twilio/status" : "/twilio/stream-status";
    const configured = kind === "status" ? env.TWILIO_STATUS_WEBHOOK_URL : env.TWILIO_STREAM_STATUS_WEBHOOK_URL;
    const url = new URL(configured || new URL(suffix, env.TWILIO_VOICE_WEBHOOK_URL).href);
    if (url.protocol !== "https:" || url.pathname !== suffix || url.search || url.hash || url.username || url.password) throw new Error("INVALID_CALLBACK_URL");
    return url.href;
  }
  function unavailable(res) {
    res.set?.("Retry-After", "5");
    return res.status(503).send("Call routing unavailable");
  }
  function statusCallback(kind, req, res) {
    // Only POST form callbacks have an established contract in this deployment.
    if (req.method !== "POST") { res.set?.("Allow", "POST"); return res.status(405).send("Method not allowed"); }
    if (String(req.headers["content-type"] || "").split(";")[0].trim().toLowerCase() !== "application/x-www-form-urlencoded") return res.status(415).send("Unsupported media type");
    let url;
    try {
      url = callbackUrl(kind);
      if (!env.TWILIO_AUTH_TOKEN || !sid(env.TWILIO_ACCOUNT_SID, "AC")) return unavailable(res);
    } catch { return unavailable(res); }
    const body = req.body;
    const signature = req.headers["x-twilio-signature"];
    let verified = false;
    try {
      verified = !!body && !Array.isArray(body) && typeof signature === "string" &&
        body.AccountSid === env.TWILIO_ACCOUNT_SID && sid(body.CallSid, "CA") &&
        twilio.validateRequest(env.TWILIO_AUTH_TOKEN, signature, url, body);
    } catch {}
    if (!verified) return res.status(403).send("Forbidden");
    logEvent(null, kind === "status" ? "STATUS_CALLBACK" : "STREAM_STATUS_CALLBACK", {
      status: body.CallStatus, streamEvent: body.StreamEvent,
    });
    return res.sendStatus(200);
  }
  function configuration() {
    try {
      const webhook = new URL(env.TWILIO_VOICE_WEBHOOK_URL);
      const stream = new URL(env.TWILIO_STREAM_URL);
      if (!env.TWILIO_AUTH_TOKEN || !sid(env.TWILIO_ACCOUNT_SID, "AC") ||
          webhook.protocol !== "https:" || webhook.pathname !== "/twilio/voice" || webhook.search || webhook.hash || webhook.username || webhook.password ||
          stream.protocol !== "wss:" || stream.pathname !== "/ws/twilio-stream" || stream.search || stream.hash || stream.username || stream.password) return null;
      return { webhook: webhook.href, stream: stream.href, streamStatus: callbackUrl("stream-status") };
    } catch { return null; }
  }
  async function voiceWebhook(req, res) {
    const config = configuration();
    if (!config) return res.status(503).send("Voice routing unavailable");
    const body = req.body;
    const signature = req.headers["x-twilio-signature"];
    let verified = false;
    try {
      verified = !!body && typeof body === "object" && !Array.isArray(body) &&
        typeof signature === "string" && body.AccountSid === env.TWILIO_ACCOUNT_SID &&
        sid(body.CallSid, "CA") && twilio.validateRequest(env.TWILIO_AUTH_TOKEN, signature, config.webhook, body);
    } catch {}
    if (!verified) return res.status(403).send("Forbidden");
    let context;
    try { context = await resolve({ calledNumber: body.To, callSid: body.CallSid, accountSid: body.AccountSid }); }
    catch { return unavailable(res); }
    if (!context || context.reason === "ROUTING_UNAVAILABLE") return unavailable(res);
    if (!context.ok) return res.status(403).send("Call routing unavailable");
    const candidate = crypto.randomBytes(32).toString("base64url");
    let token;
    try {
      // Concurrent/retried signed requests get the SAME still-pending capability.
      // No rotation, expiry extension or second admission, even across workers.
      const grants = await query(`INSERT INTO public.voice_stream_grants AS existing
        (token_hash, call_sid, account_sid, tenant_id, called_number, expires_at, token_ciphertext)
        VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP + INTERVAL '60 seconds', $6)
        ON CONFLICT (call_sid) DO UPDATE SET call_sid = existing.call_sid
        WHERE existing.account_sid = EXCLUDED.account_sid AND existing.tenant_id = EXCLUDED.tenant_id
          AND existing.called_number = EXCLUDED.called_number AND existing.consumed_at IS NULL
          AND existing.expires_at > CURRENT_TIMESTAMP
        RETURNING token_hash, token_ciphertext`,
      [hash(candidate), context.callSid, context.accountSid, context.tenantId, context.calledNumber, seal(candidate)]);
      if (grants.rows.length !== 1) {
        // Acknowledge already-consumed/expired/conflicting replay without a Stream.
        return res.status(200).type("text/xml").send(new twilio.twiml.VoiceResponse().toString());
      }
      token = open(grants.rows[0].token_ciphertext);
      if (hash(token) !== grants.rows[0].token_hash) throw new Error("INVALID_GRANT");
    } catch { return unavailable(res); }
    const response = new twilio.twiml.VoiceResponse();
    const stream = response.connect().stream({ url: config.stream, name: "aca-live-stream",
      statusCallback: config.streamStatus,
      statusCallbackMethod: "POST" });
    stream.parameter({ name: "routingToken", value: token });
    // Informational only; the stream consumer never trusts this value.
    stream.parameter({ name: "calledNumber", value: context.calledNumber });
    response.pause({ length: 60 });
    return res.status(200).type("text/xml").send(response.toString());
  }
  async function consumeStart(start) {
    if (!configuration() || !start || !sid(start.callSid, "CA") ||
        start.accountSid !== env.TWILIO_ACCOUNT_SID || !sid(start.streamSid, "MZ")) return null;
    const token = start.customParameters?.routingToken;
    if (typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
    try {
      // Atomic claim shared by all workers. Keep consumed rows to reject repeated webhooks.
      const result = await query(`UPDATE public.voice_stream_grants SET consumed_at = CURRENT_TIMESTAMP
        WHERE token_hash = $1 AND consumed_at IS NULL AND expires_at > CURRENT_TIMESTAMP
          AND call_sid = $2 AND account_sid = $3 RETURNING tenant_id, called_number`,
      [hash(token), start.callSid, start.accountSid]);
      if (result.rows.length !== 1) return null;
      const grant = result.rows[0];
      const context = await resolve({ calledNumber: grant.called_number, callSid: start.callSid, accountSid: start.accountSid });
      if (!isValidatedRoutingContext(context) || context.tenantId !== grant.tenant_id) return null;
      return context;
    } catch { return null; }
  }
  return { voiceWebhook, consumeStart, statusCallback };
}
let registry;
function getRouting() {
  if (!registry) registry = require("./carrierRegistry").createCarrierRegistry([{id:"twilio", ...createTwilioRouting({ query: (...args) => require("../db/pool").query(...args),
    resolve: require("./tenantResolver").resolveTenantFromVoiceContext })}]);
  return registry.get("twilio");
}
module.exports = { createTwilioRouting, getRouting };
