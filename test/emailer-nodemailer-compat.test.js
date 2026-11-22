"use strict";

const assert = require("node:assert/strict");
const Module = require("node:module");
const { test } = require("node:test");

const emailerPath = require.resolve("../src/brain/utils/emailer");

function loadEmailerWithMocks({ createTransport, appendFileSync = () => {} }) {
  const originalLoad = Module._load;
  const fsMock = {
    existsSync: () => true,
    mkdirSync: () => {},
    appendFileSync,
  };
  const nodemailerMock = { createTransport };

  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === "nodemailer") return nodemailerMock;
    if (request === "fs") return fsMock;
    return originalLoad(request, parent, isMain);
  };

  delete require.cache[emailerPath];
  try {
    return require(emailerPath);
  } finally {
    Module._load = originalLoad;
  }
}

test("emailer uses nodemailer transport config and sends expected payload", async () => {
  const originalEnv = { ...process.env };
  try {
    process.env.SMTP_HOST = "smtp.example.test";
    process.env.SMTP_PORT = "465";
    process.env.SMTP_USER = "smtp-user";
    process.env.SMTP_PASS = "smtp-pass";
    process.env.SMTP_FROM = "No Reply <no-reply@example.test>";

    const createTransportCalls = [];
    const sendMailCalls = [];
    const { sendBillingEmail } = loadEmailerWithMocks({
      createTransport: (config) => {
        createTransportCalls.push(config);
        return {
          sendMail: async (mailOptions) => {
            sendMailCalls.push(mailOptions);
            return { messageId: "synthetic-id" };
          },
        };
      },
    });

    const result = await sendBillingEmail(
      "recipient@example.test",
      "Invoice ready",
      "<p>invoice</p>",
      "invoice"
    );

    assert.equal(createTransportCalls.length, 1);
    assert.deepEqual(createTransportCalls[0], {
      host: "smtp.example.test",
      port: 465,
      secure: true,
      auth: {
        user: "smtp-user",
        pass: "smtp-pass",
      },
      tls: {
        rejectUnauthorized: false,
      },
    });
    assert.equal(sendMailCalls.length, 1);
    assert.deepEqual(sendMailCalls[0], {
      from: "No Reply <no-reply@example.test>",
      to: "recipient@example.test",
      subject: "Invoice ready",
      text: "invoice",
      html: "<p>invoice</p>",
    });
    assert.deepEqual(result, { messageId: "synthetic-id" });
  } finally {
    process.env = originalEnv;
  }
});

test("emailer retries failed sends three times before surfacing error", async () => {
  const originalEnv = { ...process.env };
  try {
    const sendErr = new Error("synthetic send failure");
    let sendAttempts = 0;
    const logs = [];

    const { sendBillingEmail } = loadEmailerWithMocks({
      createTransport: () => ({
        sendMail: async () => {
          sendAttempts += 1;
          throw sendErr;
        },
      }),
      appendFileSync: (_path, line) => logs.push(line),
    });

    await assert.rejects(
      sendBillingEmail("recipient@example.test", "Invoice ready", "<p>invoice</p>", "invoice"),
      sendErr
    );
    assert.equal(sendAttempts, 3);
    assert.equal(logs.filter((line) => line.includes("Email attempt")).length, 3);
  } finally {
    process.env = originalEnv;
  }
});
