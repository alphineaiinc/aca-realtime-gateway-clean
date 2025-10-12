if (event.start && event.start.customParameters) {
  ws.business_id = event.start.customParameters.business_id;
  console.log("🧩 Business context attached:", ws.business_id);
}
