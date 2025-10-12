// watchdog.js
// Spawns index.js, polls /monitor/health, restarts on failure.

const { spawn } = require("child_process");
const http = require("http");
const path = require("path");
const { inc, set } = require("./src/monitor/resilienceMetrics");

let child = null;
let restarting = false;

function startChild() {
  console.log("🚀 Starting ACA Orchestrator...");
  const indexPath = path.join(__dirname, "index.js");

  child = spawn(process.execPath, [indexPath], {
    stdio: "inherit", // ensures you see child logs in console
    env: process.env,
  });

  child.on("exit", (code, signal) => {
    console.log(`⚠️  Orchestrator exited (code=${code}, signal=${signal})`);
    set("lastCrashAt", new Date().toISOString());
    if (!restarting) scheduleRestart("child-exit");
  });
}

function scheduleRestart(reason) {
  restarting = true;
  inc("watchdogRestarts");
  console.log("🔁 Restart triggered due to:", reason);
  setTimeout(() => {
    restarting = false;
    startChild();
  }, 2000);
}

function checkHealth() {
  const req = http.get("http://127.0.0.1:8080/monitor/health", (res) => {
    if (res.statusCode !== 200) {
      console.log("⚠️  Health check failed:", res.statusCode);
      scheduleRestart("bad-status");
    }
    res.resume();
  });

  req.on("error", (err) => {
    console.log("⚠️  Health check connection error:", err.message);
    scheduleRestart("conn-error");
  });
}

startChild();
setInterval(checkHealth, 5000);
