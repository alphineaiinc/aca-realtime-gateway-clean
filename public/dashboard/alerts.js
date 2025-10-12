const API_URL = "/monitor/alerts";
const tableBody = document.querySelector("#alertsTable tbody");
const filter = document.getElementById("severityFilter");
const refreshBtn = document.getElementById("refreshBtn");

async function loadAlerts() {
  try {
    const res = await fetch(API_URL);
    const data = await res.json();
    if (!data.ok) throw new Error("Failed to fetch alerts");

    const severity = filter.value;
    const alerts = data.alerts.filter(a => !severity || a.severity === severity);

    tableBody.innerHTML = alerts.length
      ? alerts.map(a => `
        <tr class="${a.severity}">
          <td>${new Date(a.time || a.timestamp).toLocaleString()}</td>
          <td class="fw-bold text-uppercase">${a.severity}</td>
          <td>${a.message}</td>
          <td>${a.source || "-"}</td>
        </tr>`).join("")
      : `<tr><td colspan="4" class="text-center text-secondary">No alerts</td></tr>`;
  } catch (err) {
    tableBody.innerHTML = `<tr><td colspan="4" class="text-danger text-center">⚠️ ${err.message}</td></tr>`;
  }
}

filter.addEventListener("change", loadAlerts);
refreshBtn.addEventListener("click", loadAlerts);

// Auto refresh every 15s
setInterval(loadAlerts, 15000);

loadAlerts();
