// gpt_function_test.js
// Purpose: Test OpenAI API connection for ACA Orchestrator (Story 1.2)

// Load environment variables explicitly from parent directory (.env in project root)
require("dotenv").config({ path: "../.env" });

// Verify API key loaded
console.log("Loaded OPENAI_API_KEY?", !!process.env.OPENAI_API_KEY);

// Import OpenAI client (CommonJS style)
const OpenAI = require("openai");

// Initialize client with API key
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function runTest() {
  try {
    // Simple test prompt
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are Alphine AI test bot." },
        { role: "user", content: "Say hello in one line." },
      ],
    });

    console.log("✅ Test successful. Response from AI:");
    console.log(response.choices[0].message.content);

  } catch (error) {
    console.error("❌ Error while testing OpenAI connection:");
    console.error(error);
  }
}

// Run the test
runTest();
