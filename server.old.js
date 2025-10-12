"use strict";
require("dotenv").config();
const http = require("http");
const express = require("express");
const pino = require("pino");
const { createWsServer } = require("./src/ws");

const logger = pino({ level: process.env.LOG_LEVEL || "info" });
const app = express();
app.use(express.json());

// Health endpoint
app.get("/health", (_req, res) => res.status(200).send("OK"));

// Twilio webhook
app.post("/twilio/voice", (req, res) => {
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const secret = encodeURIComponent(process.env.WS_SHARED_SECRET || "");
  const wsUrl = `wss://${host}/media-stream?secret=${secret}`;   // ✅ fixed
  const twiml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<Response>` +
      `<Connect>` +
        `<Stream url="${wsUrl}" />` +
      `</Connect>` +
    `</Response>`;
  res.set("Content-Type", "text/xml");
  res.send(twiml);
});

const server = http.createServer(app);

// 🔑 Critical line: attach WS upgrade handler
createWsServer(server);

const port = Number(process.env.APP_PORT || 8080);
server.listen(port, () => logger.info({ port }, "HTTP+WS server listening"));
