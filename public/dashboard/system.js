// ===============================================
// system.js — ACA System Dashboard Client
// Story 4.5 — Realtime Alert Banner Update
// ===============================================

const statusBanner = document.querySelector(".status-banner");
const alertList = document.getElementById("alertList");
const API_BASE = "/monitor";

// Utility: create colored banner
function setBanner(text, level = "normal") {
  if (!statusBanner) return;
  statusBanner.textContent = text;

  // reset style
  statusBanner.className = "status-banner";

  if (level === "critical") {
    statusBanner.style.background = "#b91c1c";
    statusBanner.style.color = "#fff";
  } else if (level === "warning") {
    statusBanner.style.background = "#facc15";
    statusBanner.style.color = "#111";
  } else {
    statusBanner.style.background = "#16a34a";
    statusBanner.style.color = "#fff";
  }
}

// Fetch alerts periodically
async function fetchAlerts() {
  try {
    const res = await fetch(`${API_BASE}/alerts`);
    const data = await res.json();

    if (data.ok && Array.isArray(data.alerts)) {
      alertList.innerHTML = "";
      let latestLevel = "normal";

      data.alerts.forEach((alert) => {
        const li = document.createElement("li");
        li.classList.add("list-group-item");
        li.textContent = `${alert.timestamp} — [${alert.level.toUpperCase()}] ${alert.component}: ${alert.message}`;
        if (alert.level === "critical") li.style.color = "#ef4444";
        else if (alert.level === "warning") li.style.color = "#f59e0b";
        alertList.appendChild(li);

        // Check latest alert level
        if (alert.level === "critical" && latestLevel !== "critical")
          latestLevel = "critical";
        else if (alert.level === "warning" && latestLevel === "normal")
          latestLevel = "warning";
      });

      // Banner reflects latest alert level
      if (latestLevel === "critical")
