// public/dashboard/voice.js
// ----------------------------------------------------
// Story 9.X — Voice Studio front-end
// Talks to /api/voice/profile and /api/voice/preview
// ----------------------------------------------------

// TODO: Adjust this to however you store your JWT on dashboards.
function getAuthToken() {
  // Example: stored in localStorage from login
  return localStorage.getItem("aca_dashboard_token") || "";
}

function setStatus(msg, isError = false) {
  const el = document.getElementById("status");
  if (!el) return;
  el.textContent = msg;
  el.style.color = isError ? "#f85149" : "#9aa4ad";
}

async function loadProfile() {
  try {
    const langCode = document.getElementById("langCode").value;
    const res = await fetch(`/api/voice/profile?langCode=${encodeURIComponent(langCode)}`, {
      headers: {
        Authorization: `Bearer ${getAuthToken()}`,
      },
    });

    const data = await res.json();
    if (!data.ok) {
      setStatus(`Failed to load profile: ${data.error || "Unknown error"}`, true);
      return;
    }

    const p = data.profile || {};
    document.getElementById("voiceId").value = p.voice_id || "";
    document.getElementById("tonePreset").value = p.tone_preset || "friendly";
    document.getElementById("regionCode").value = p.region_code || "";
    document.getElementById("stability").value = p.stability ?? 0.4;
    document.getElementById("similarity").value = p.similarity_boost ?? 0.8;
    document.getElementById("speakingRate").value = p.speaking_rate ?? 1.0;

    setStatus("Loaded current voice profile.");
  } catch (err) {
    console.error(err);
    setStatus("Error loading profile.", true);
  }
}

async function saveProfile() {
  try {
    const token = getAuthToken();
    if (!token) {
      setStatus("Missing dashboard token. Please log in again.", true);
      return;
    }

    const body = {
      lang_code: document.getElementById("langCode").value,
      voice_id: document.getElementById("voiceId").value || null,
      tone_preset: document.getElementById("tonePreset").value,
      region_code: document.getElementById("regionCode").value || null,
      stability: parseFloat(document.getElementById("stability").value),
      similarity_boost: parseFloat(document.getElementById("similarity").value),
      speaking_rate: parseFloat(document.getElementById("speakingRate").value),
    };

    const res = await fetch("/api/voice/profile", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    if (!data.ok) {
      setStatus(`Failed to save profile: ${data.error || "Unknown error"}`, true);
      return;
    }

    setStatus("Voice profile saved.");
  } catch (err) {
    console.error(err);
    setStatus("Error saving profile.", true);
  }
}

async function previewVoice() {
  try {
    const token = getAuthToken();
    if (!token) {
      setStatus("Missing dashboard token. Please log in again.", true);
      return;
    }

    setStatus("Generating preview…");

    const body = {
      lang_code: document.getElementById("langCode").value,
      tone_preset: document.getElementById("tonePreset").value,
      region_code: document.getElementById("regionCode").value || null,
      sample_text: document.getElementById("sampleText").value || null,
      use_fillers: true,
    };

    const res = await fetch("/api/voice/preview", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("Preview error:", text);
      setStatus("Preview failed.", true);
      return;
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);

    const audioEl = document.getElementById("previewAudio");
    audioEl.style.display = "block";
    audioEl.src = url;
    audioEl.play().catch(() => {
      // ignore autoplay issues
    });

    setStatus("Preview ready.");
  } catch (err) {
    console.error(err);
    setStatus("Error generating preview.", true);
  }
}

function initVoiceStudio() {
  const langSelect = document.getElementById("langCode");
  const btnSave = document.getElementById("btnSave");
  const btnPreview = document.getElementById("btnPreview");

  if (langSelect) {
    langSelect.addEventListener("change", loadProfile);
  }
  if (btnSave) {
    btnSave.addEventListener("click", (e) => {
      e.preventDefault();
      saveProfile();
    });
  }
  if (btnPreview) {
    btnPreview.addEventListener("click", (e) => {
      e.preventDefault();
      previewVoice();
    });
  }

  loadProfile();
}

document.addEventListener("DOMContentLoaded", initVoiceStudio);
