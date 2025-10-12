const API_URL = "/monitor/recoveries";
const tableBody = document.querySelector("#recoveryTable tbody");
const refreshBtn = document.getElementById("refreshBtn");

async function loadRecoveries() {
  try {
    const res = await fetch(API_URL);
    const data = await res.json();
    if (!data.ok) throw new Error("Failed to fetch recoveries");

    tableBody.innerHTML = data.recoveries.length
      ? data.recoveries.map(r => `
        <tr class="${r.success ? 'success' : 'failure'}">
          <td>${new Date(r.timestamp).toLocaleString()}</td>
          <td>${r.issueType}</td>
          <td>${r.source || '-'}</td>
          <td>${r.action}</td>
          <td>${r.success ? '✅ Success' : '❌ Failed'}</td>
        </tr>`).join("")
      : `<tr><td colspan="5" class="text-center text-secondary">No recovery records</td></tr>`;
  } catch (err) {
    tableBody.innerHTML = `<tr><td colspan="5" class="text-danger text-center">⚠️ ${err.message}</td></tr>`;
  }
}

refreshBtn.addEventListener("click", loadRecoveries);
setInterval(loadRecoveries, 15000);
loadRecoveries();
