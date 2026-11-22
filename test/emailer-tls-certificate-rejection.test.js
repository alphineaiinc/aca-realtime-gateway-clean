"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const tls = require("node:tls");
const nodemailer = require("nodemailer");

// Isolated local TLS verification: no external SMTP service, credentials, or network.
test("Nodemailer rejects an untrusted SMTP TLS certificate", { timeout: 15000 }, async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aca-smtp-tls-"));
  const keyPath = path.join(tempDir, "server.key");
  const certPath = path.join(tempDir, "server.crt");
  let server;
  let transport;
  try {
    execFileSync("openssl", [
      "req", "-x509", "-newkey", "rsa:2048", "-nodes",
      "-keyout", keyPath, "-out", certPath,
      "-subj", "/CN=localhost", "-days", "1",
    ], { stdio: "ignore", timeout: 10000 });

    server = tls.createServer({
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath),
    }, (socket) => {
      socket.write("220 localhost ESMTP test\r\n");
      socket.on("data", () => socket.end());
    });
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });

    transport = nodemailer.createTransport({
      host: "localhost",
      port: server.address().port,
      secure: true,
      connectionTimeout: 3000,
      greetingTimeout: 3000,
      socketTimeout: 3000,
      tls: { rejectUnauthorized: true },
    });
    // This tests the actual TLS handshake, not a mocked createTransport.
    await assert.rejects(
      transport.sendMail({
        from: "sender@example.test",
        to: "recipient@example.test",
        subject: "TLS rejection check",
        text: "Must not send",
      }),
      (err) => {
        assert.match(String(err.message), /self.signed|certificate|unable to verify/i);
        return true;
      }
    );
  } finally {
    if (transport) transport.close();
    if (server) await new Promise((resolve) => server.close(resolve));
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
