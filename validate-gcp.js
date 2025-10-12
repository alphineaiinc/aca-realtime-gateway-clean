const {SpeechClient} = require("@google-cloud/speech");
const client = new SpeechClient();

async function main() {
  try {
    const projectId = await client.getProjectId();
    console.log("✅ Google Project ID:", projectId);
    console.log("🎉 Credentials and API access are working!");
  } catch (err) {
    console.error("❌ Validation failed:", err.message);
    console.error("Full error object:", err);
  }
}

main();
