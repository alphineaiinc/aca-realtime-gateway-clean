const fs = require("fs");
const path = require("path");
const https = require("https");

const REG_PATH = path.join(__dirname, "../../../config/languageRegistry.json");

function loadLocal() {
  try {
    const data = JSON.parse(fs.readFileSync(REG_PATH, "utf8"));
    return data.languages || {};
  } catch (e) {
    console.warn("⚠️ Cannot load local registry:", e.message);
    return {};
  }
}

function fetchGlobalRegistry() {
  return new Promise((resolve) => {
    const url = "https://datahub.io/core/language-codes/r/language-codes-full.json";
    https.get(url, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          const map = {};
          json.forEach((l) => {
            if (l["alpha2"] && l["English"]) map[l["alpha2"]] = l["English"];
          });
          resolve(map);
        } catch {
          resolve({});
        }
      });
    }).on("error", () => resolve({}));
  });
}

async function loadLanguages() {
  const local = loadLocal();
  const global = await fetchGlobalRegistry();
  return { ...global, ...local }; // local overrides global
}

function registerLanguage(code, name) {
  const local = loadLocal();
  if (!local[code]) {
    local[code] = name || code;
    fs.writeFileSync(REG_PATH, JSON.stringify({ languages: local }, null, 2));
    console.log("🌍 Added new language:", code);
  }
}

module.exports = { loadLanguages, registerLanguage };
