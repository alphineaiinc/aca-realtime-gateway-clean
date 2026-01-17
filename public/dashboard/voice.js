// public/dashboard/voice.js
// Voice Studio – per-tenant voice profile dashboard
// NOTE: Only stored in memory on the client. JWT is never persisted.

const state = {
  jwt: "",
  isMasked: true,
  loadingProfile: false,
  savingProfile: false,
  previewing: false,
  lastProfileUpdatedAt: null,
};

// -----------------------------
// DOM helpers
// -----------------------------

const $ = (id) => document.getElementById(id);

const els = {
  // JWT + controls
  jwt: $("jwtInput"),
  btnToggleToken: $("toggleJwtVisibilityBtn"),
  jwtStatusDot: $("jwtStatusDot"),
  jwtStatusText: $("jwtStatusText"),

  // Profile controls
  ttsProvider: $("ttsProviderSelect"),
  languageCode: $("languageSelect"),
  voiceId: $("voiceIdInput"),

  stability: $("stabilitySlider"),
  stabilityValue: $("stabilityValue"),
  similarityBoost: $("similaritySlider"),
  similarityBoostValue: $("similarityValue"),
  style: $("styleSlider"),
  styleValue: $("styleValue"),
  speakingRate: $("rateSlider"),
  speakingRateValue: $("rateValue"),
  pitchShift: $("pitchSlider"),
  pitchShiftValue: $("pitchValue"),
  useSpeakerBoost: $("speakerBoostCheckbox"),

  btnLoad: $("loadProfileBtn"),
  btnSave: $("saveProfileBtn"),
  btnReset: $("resetDefaultsBtn"),

  statusDotProfile: $("profileStatusDot"),
  statusTextProfile: $("profileStatusText"),

  // Preview + logs
  previewText: $("previewText"),
  btnPreview: $("generatePreviewBtn"),
  btnStop: $("btn-stop"),
  audio: $("previewAudio"),
  previewCaptionLeft: $("preview-caption-left"),
  previewRouteLabel: $("preview-route-label"),
  statusDotPreview: $("previewStatusDot"),
  statusTextPreview: $("previewStatusText"),

  logShell: $("logPanel"),
};

// -----------------------------
// Logging
// -----------------------------

function log(message, level = "info") {
  if (!els.logShell) return;

  const line = document.createElement("div");
  line.classList.add("log-line");

  if (level === "ok") line.classList.add("ok");
  if (level === "err") line.classList.add("err");
  if (level === "dim") line.classList.add("dim");

  const now = new Date();
  const time = now.toLocaleTimeString(undefined, {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const timeSpan = document.createElement("span");
  timeSpan.classList.add("time");
  timeSpan.textContent = `[${time}]`;

  const msgSpan = document.createElement("span");
  msgSpan.textContent = message;

  line.appendChild(timeSpan);
  line.appendChild(msgSpan);

  els.logShell.appendChild(line);
  els.logShell.scrollTop = els.logShell.scrollHeight;
}

// -----------------------------
// Status helpers
// -----------------------------

function setProfileStatus(mode, text) {
  // mode: "idle" | "ok" | "warn" | "err"
  const dot = els.statusDotProfile;
  const label = els.statusTextProfile;
  if (!dot || !label) return;

  dot.classList.remove("ok", "warn", "err");

  switch (mode) {
    case "ok":
      dot.classList.add("ok");
      break;
    case "warn":
      dot.classList.add("warn");
      break;
    case "err":
      dot.classList.add("err");
      break;
    default:
      // idle = grey
      break;
  }

  label.textContent = text;
}

function setPreviewStatus(mode, text) {
  const dot = els.statusDotPreview;
  const label = els.statusTextPreview;
  if (!dot || !label) return;

  dot.classList.remove("ok", "warn", "err");

  switch (mode) {
    case "ok":
      dot.classList.add("ok");
      break;
    case "warn":
      dot.classList.add("warn");
      break;
    case "err":
      dot.classList.add("err");
      break;
    default:
      break;
  }

  label.textContent = text;
}

function setJwtStatus(mode, text) {
  // mode: "idle" | "ok" | "warn" | "err"
  const dot = els.jwtStatusDot;
  const label = els.jwtStatusText;
  if (!dot || !label) return;

  dot.classList.remove("ok", "warn", "err");

  switch (mode) {
    case "ok":
      dot.classList.add("ok");
      break;
    case "warn":
      dot.classList.add("warn");
      break;
    case "err":
      dot.classList.add("err");
      break;
    default:
      // idle = grey
      break;
  }

  label.textContent = text;
}

function setButtonsDisabled(disabled) {
  if (els.btnLoad) els.btnLoad.disabled = disabled || state.loadingProfile;
  if (els.btnSave) els.btnSave.disabled = disabled || state.savingProfile;
  if (els.btnReset) els.btnReset.disabled = disabled;
  if (els.btnPreview) els.btnPreview.disabled = disabled || state.previewing;
  if (els.btnStop) els.btnStop.disabled = disabled;
}

// -----------------------------
// JWT + token handling
// -----------------------------

function ensureJwtOrWarn() {
  const raw = (els.jwt.value || "").trim();
  if (!raw) {
    setJwtStatus("err", "Missing JWT – paste tenant token and try again.");
    setProfileStatus("warn", "Missing JWT. Paste a valid tenant token first.");
    setPreviewStatus("warn", "Missing JWT. Paste a valid tenant token first.");
    log("Missing JWT when trying to call an API.", "err");
    return false;
  }
  state.jwt = raw;
  return true;
}

function toggleTokenMask() {
  state.isMasked = !state.isMasked;
  els.jwt.type = state.isMasked ? "password" : "text";
  els.btnToggleToken.textContent = state.isMasked ? "SHOW" : "HIDE";
}

// -----------------------------
// Slider display helpers
// -----------------------------

function updateSliderDisplays() {
  if (els.stabilityValue && els.stability)
    els.stabilityValue.textContent = Number(els.stability.value).toFixed(2);
  if (els.similarityBoostValue && els.similarityBoost)
    els.similarityBoostValue.textContent = Number(
      els.similarityBoost.value
    ).toFixed(2);
  if (els.styleValue && els.style)
    els.styleValue.textContent = Number(els.style.value).toFixed(2);

  if (els.speakingRateValue && els.speakingRate) {
    const rate = Number(els.speakingRate.value).toFixed(2);
    els.speakingRateValue.textContent = `${rate}×`;
  }

  if (els.pitchShiftValue && els.pitchShift) {
    const pitch = Number(els.pitchShift.value);
    const sign = pitch > 0 ? "+" : pitch < 0 ? "−" : "";
    const abs = Math.abs(pitch);
    els.pitchShiftValue.textContent =
      abs === 0 ? "0 st" : `${sign}${abs} st`;
  }
}

// -----------------------------
// Profile (get / save / reset)
// -----------------------------

function getProfilePayloadFromUi() {
  return {
    tts_provider: els.ttsProvider.value || "elevenlabs",
    language_code: els.languageCode.value || "en-US",
    voice_id: (els.voiceId.value || "").trim() || null,
    stability: Number(els.stability.value),
    similarity_boost: Number(els.similarityBoost.value),
    style: Number(els.style.value),
    speaking_rate: Number(els.speakingRate.value),
    pitch_shift: Number(els.pitchShift.value),
    use_speaker_boost: !!els.useSpeakerBoost.checked,
  };
}

function applyProfileToUi(profile) {
  if (!profile) return;

  if (profile.tts_provider) els.ttsProvider.value = profile.tts_provider;
  if (profile.language_code) els.languageCode.value = profile.language_code;
  if (profile.voice_id) els.voiceId.value = profile.voice_id;

  if (typeof profile.stability === "number") {
    els.stability.value = profile.stability;
  }
  if (typeof profile.similarity_boost === "number") {
    els.similarityBoost.value = profile.similarity_boost;
  }
  if (typeof profile.style === "number") {
    els.style.value = profile.style;
  }
  if (typeof profile.speaking_rate === "number") {
    els.speakingRate.value = profile.speaking_rate;
  }
  if (typeof profile.pitch_shift === "number") {
    els.pitchShift.value = profile.pitch_shift;
  }
  if (typeof profile.use_speaker_boost === "boolean") {
    els.useSpeakerBoost.checked = profile.use_speaker_boost;
  }

  updateSliderDisplays();
}

function resetProfileToDefaults() {
  els.ttsProvider.value = "elevenlabs";
  els.languageCode.value = "en-US";
  els.voiceId.value = "";

  els.stability.value = 0.5;
  els.similarityBoost.value = 0.75;
  els.style.value = 0.3;
  els.speakingRate.value = 1.0;
  els.pitchShift.value = 0;
  els.useSpeakerBoost.checked = true;

  updateSliderDisplays();
  setProfileStatus("idle", "Reset to safe default values (not yet saved).");
  log("Profile reset to safe defaults (not persisted).", "dim");
}

async function loadProfileFromServer() {
  if (!ensureJwtOrWarn()) return;

  const url = "/api/voice/profile";

  try {
    state.loadingProfile = true;
    setButtonsDisabled(false);
    setProfileStatus("idle", "Loading voice profile from tenant...");
    log(`GET ${url}`, "dim");

    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${state.jwt}`,
        "X-Requested-With": "VoiceStudioDashboard",
      },
    });

    const contentType = res.headers.get("content-type") || "";
    if (!res.ok) {
      const text = await res.text();
      setProfileStatus(
        "err",
        `Failed to load profile (${res.status}). See log for details.`
      );
      log(
        `Error loading profile [${res.status}]: ${
          text.slice(0, 400) || "<no body>"
        }`,
        "err"
      );
      setJwtStatus("err", "JWT accepted by browser but API returned an error.");
      return;
    }

    let body;
    if (contentType.includes("application/json")) {
      body = await res.json();
    } else {
      const raw = await res.text();
      try {
        body = JSON.parse(raw);
      } catch {
        body = { ok: true, profile: null };
        log("Profile response was non-JSON; applied no changes.", "warn");
      }
    }

    if (!body || body.ok === false) {
      const msg = (body && (body.error || body.message)) || "Unknown error";
      setProfileStatus("err", `Error from API: ${msg}`);
      log(`API error while loading profile: ${msg}`, "err");
      setJwtStatus("err", "JWT accepted by server but profile load failed.");
      return;
    }

    const profile = body.profile || body.data || body;
    applyProfileToUi(profile);

    const ts =
      (profile && (profile.updated_at || profile.created_at)) ||
      new Date().toISOString();
    state.lastProfileUpdatedAt = ts;

    setProfileStatus("ok", "Profile loaded from tenant.");
    setJwtStatus("ok", "JWT accepted and tenant profile loaded.");
    log("Profile successfully loaded from tenant.", "ok");
  } catch (err) {
    console.error(err);
    setProfileStatus(
      "err",
      "Unexpected error while loading profile. Check console/logs."
    );
    setJwtStatus("err", "Unexpected error while calling profile API.");
    log(`Unexpected error while loading profile: ${String(err)}`, "err");
  } finally {
    state.loadingProfile = false;
    setButtonsDisabled(false);
  }
}

async function saveProfileToServer() {
  if (!ensureJwtOrWarn()) return;

  const url = "/api/voice/profile";
  const payload = getProfilePayloadFromUi();

  try {
    state.savingProfile = true;
    setButtonsDisabled(false);
    setProfileStatus("idle", "Saving voice profile to tenant...");
    log(`POST ${url}`, "dim");
    log(`Payload: ${JSON.stringify(payload)}`, "dim");

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${state.jwt}`,
        "Content-Type": "application/json",
        "X-Requested-With": "VoiceStudioDashboard",
      },
      body: JSON.stringify(payload),
    });

    const contentType = res.headers.get("content-type") || "";
    let body = null;

    if (!res.ok) {
      const text = await res.text();
      setProfileStatus(
        "err",
        `Failed to save profile (${res.status}). See log for details.`
      );
      log(
        `Error saving profile [${res.status}]: ${
          text.slice(0, 400) || "<no body>"
        }`,
        "err"
      );
      return;
    }

    if (contentType.includes("application/json")) {
      body = await res.json();
    } else {
      const raw = await res.text();
      try {
        body = JSON.parse(raw);
      } catch {
        body = { ok: true };
      }
    }

    if (body && body.ok === false) {
      const msg = body.error || body.message || "Unknown error";
      setProfileStatus("err", `API error while saving: ${msg}`);
      log(`API error while saving profile: ${msg}`, "err");
      return;
    }

    state.lastProfileUpdatedAt =
      (body && (body.updated_at || body.saved_at)) ||
      new Date().toISOString();

    setProfileStatus("ok", "Profile saved for this tenant.");
    log("Profile saved successfully.", "ok");
  } catch (err) {
    console.error(err);
    setProfileStatus(
      "err",
      "Unexpected error while saving profile. Check console/logs."
    );
    log(`Unexpected error while saving profile: ${String(err)}`, "err");
  } finally {
    state.savingProfile = false;
    setButtonsDisabled(false);
  }
}

// -----------------------------
// Preview
// -----------------------------

async function generatePreview() {
  if (!ensureJwtOrWarn()) return;

  const text = (els.previewText.value || "").trim();
  if (!text) {
    setPreviewStatus("warn", "Enter some text to preview.");
    log("Cannot generate preview: empty preview text.", "err");
    return;
  }

  const url = "/api/voice/preview";
  const profile = getProfilePayloadFromUi();

  try {
    state.previewing = true;
    setButtonsDisabled(false);
    setPreviewStatus("idle", "Generating preview via orchestrator...");
    if (els.previewCaptionLeft)
      els.previewCaptionLeft.textContent = "Synthesizing preview...";
    log(`POST ${url} (expecting audio/mpeg)`, "dim");

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${state.jwt}`,
        "Content-Type": "application/json",
        "X-Requested-With": "VoiceStudioDashboard",
      },
      body: JSON.stringify({
        text,
        profile,
      }),
    });

    if (!res.ok) {
      const textBody = await res.text();
      setPreviewStatus(
        "err",
        `Preview failed (${res.status}). See log for details.`
      );
      if (els.previewCaptionLeft) els.previewCaptionLeft.textContent = "Preview failed.";
      log(
        `Error generating preview [${res.status}]: ${
          textBody.slice(0, 400) || "<no body>"
        }`,
        "err"
      );
      return;
    }

    const contentType = res.headers.get("content-type") || "";
    if (
      !contentType.includes("audio/") &&
      !contentType.includes("octet-stream")
    ) {
      // Fallback if backend returns JSON with a URL
      try {
        const body = await res.json();
        if (body && body.audio_url) {
          els.audio.src = body.audio_url;
          els.audio.play().catch(() => {
            /* ignore */
          });
          if (els.previewCaptionLeft)
            els.previewCaptionLeft.textContent =
              "Preview loaded from URL returned by API.";
          setPreviewStatus("ok", "Preview ready.");
          log("Preview loaded from audio_url JSON field.", "ok");
          return;
        }

        setPreviewStatus(
          "err",
          "Preview response was not audio. Check server route."
        );
        if (els.previewCaptionLeft)
          els.previewCaptionLeft.textContent =
            "Preview response was not audio. See logs.";
        log(
          `Preview response content-type mismatch: ${contentType}`,
          "err"
        );
        return;
      } catch (e) {
        setPreviewStatus(
          "err",
          "Failed to parse preview response. Check server."
        );
        if (els.previewCaptionLeft)
          els.previewCaptionLeft.textContent =
            "Cannot parse preview response. See logs.";
        log(
          `Failed to parse non-audio preview response: ${String(e)}`,
          "err"
        );
        return;
      }
    }

    const blob = await res.blob();
    const urlObject = URL.createObjectURL(blob);

    els.audio.src = urlObject;
    try {
      await els.audio.play();
    } catch {
      // user might not interact yet; ignore autoplay issues
    }

    if (els.previewCaptionLeft)
      els.previewCaptionLeft.textContent =
        "Preview generated. Adjust sliders and try again as needed.";
    setPreviewStatus("ok", "Preview ready and playing.");
    log("Preview audio generated and loaded into player.", "ok");
  } catch (err) {
    console.error(err);
    setPreviewStatus(
      "err",
      "Unexpected error during preview. Check console/logs."
    );
    if (els.previewCaptionLeft)
      els.previewCaptionLeft.textContent = "Preview error. See logs.";
    log(`Unexpected error during preview: ${String(err)}`, "err");
  } finally {
    state.previewing = false;
    setButtonsDisabled(false);
  }
}

function stopPreview() {
  try {
    els.audio.pause();
    els.audio.currentTime = 0;
    els.audio.removeAttribute("src");
  } catch {
    // ignore
  }
  if (els.previewCaptionLeft)
    els.previewCaptionLeft.textContent =
      "Preview cleared. Generate again to hear changes.";
  setPreviewStatus("idle", "Preview stopped / cleared.");
  log("Preview playback stopped and audio cleared.", "dim");
}

// -----------------------------
// Event wiring
// -----------------------------

function wireEvents() {
  if (!els.jwt) return;

  if (els.btnToggleToken)
    els.btnToggleToken.addEventListener("click", toggleTokenMask);

  els.jwt.addEventListener("input", () => {
    // we just keep in DOM; ensureJwtOrWarn() reads it
  });

  // Sliders
  [
    els.stability,
    els.similarityBoost,
    els.style,
    els.speakingRate,
    els.pitchShift,
  ].forEach((slider) => {
    if (!slider) return;
    slider.addEventListener("input", updateSliderDisplays);
  });

  // Buttons
  if (els.btnLoad)
    els.btnLoad.addEventListener("click", () => {
      loadProfileFromServer();
    });

  if (els.btnSave)
    els.btnSave.addEventListener("click", () => {
      saveProfileToServer();
    });

  if (els.btnReset)
    els.btnReset.addEventListener("click", () => {
      resetProfileToDefaults();
    });

  if (els.btnPreview)
    els.btnPreview.addEventListener("click", () => {
      generatePreview();
    });

  if (els.btnStop)
    els.btnStop.addEventListener("click", () => {
      stopPreview();
    });
}

// -----------------------------
// Init
// -----------------------------

function init() {
  updateSliderDisplays();
  setProfileStatus("idle", "Idle — not yet loaded from tenant.");
  setPreviewStatus(
    "idle",
    "Idle — enter text and click Generate preview."
  );
  setJwtStatus(
    "warn",
    "JWT not validated yet. Paste a token and load the profile."
  );
  log("Voice Studio dashboard loaded.", "info");
  wireEvents();
}

// Run
document.addEventListener("DOMContentLoaded", init);
