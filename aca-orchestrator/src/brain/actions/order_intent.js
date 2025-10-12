const { generateOrderConfirmation } = require("./order_confirm");

async function executeOrderIntent(parsedOrder) {
  // 1️⃣ Save order to DB (already implemented)
  const order = await saveOrderToDB(parsedOrder);

  // 2️⃣ Generate confirmation
  const { confirmationText, audioUrl } = await generateOrderConfirmation(order);

  // 3️⃣ Return both text + audio link to orchestrator
  return {
    status: "confirmed",
    order_id: order.id,
    confirmationText,
    audioUrl,
  };
}
