// src/brain/utils/cryptoVault.js
// AES-256-GCM encrypt/decrypt for payout fields. Uses ENCRYPTION_KEY from .env.
const crypto = require("crypto");

const ENC_KEY = process.env.ENCRYPTION_KEY; // 32 bytes recommended (base64 or hex)

function getKey() {
  if (!ENC_KEY) throw new Error("ENCRYPTION_KEY missing in environment");
  // Support base64 or hex; fall back to utf8 (dev only)
  let key;
  try {
    key = Buffer.from(ENC_KEY, "base64");
  } catch { /* ignore */ }
  if (!key || (key.length !== 32 && key.length !== 48)) {
    try {
      key = Buffer.from(ENC_KEY, "hex");
    } catch { /* ignore */ }
  }
  if (!key || key.length < 32) key = Buffer.from(ENC_KEY, "utf8");
  return key.slice(0, 32);
}

function encrypt(value) {
  if (value == null) return null;
  const key = getKey();
  const iv = crypto.randomBytes(12); // GCM standard
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(String(value), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]); // store iv|tag|ciphertext
}

function decrypt(buf) {
  if (!buf) return null;
  const key = getKey();
  const b = Buffer.from(buf);
  const iv = b.slice(0, 12);
  const tag = b.slice(12, 28);
  const data = b.slice(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(data), decipher.final()]);
  return dec.toString("utf8");
}

module.exports = { encrypt, decrypt };
