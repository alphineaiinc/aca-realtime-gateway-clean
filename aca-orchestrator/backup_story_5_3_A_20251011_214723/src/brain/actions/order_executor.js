// ========================================================
// Story 3.3 — Intent-Driven Order Execution
// ========================================================
const { createLogger } = require('../utils/logger');
const { saveOrder } = require('../../db/order');
const logger = createLogger({ level: 'info' });

// Simple extractor (future: integrate GPT entity parser)
function parseItemsFromText(text) {
  const menu = ['coffee', 'latte', 'cappuccino', 'tea', 'sandwich', 'muffin'];
  const found = menu.filter(i => text.toLowerCase().includes(i));
  return found.map(name => ({ name, qty: 1 }));
}

async function executeOrderIntent(business_id, userText) {
  const items = parseItemsFromText(userText);
  if (!items.length) {
    logger.warn(`🧐 No recognizable items in: "${userText}"`);
    return { success: false, message: 'No valid items detected.' };
  }

  const order = {
    business_id,
    items,
    status: 'pending',
    source: 'voice',
    created_at: new Date()
  };

  const saved = await saveOrder(order);
  logger.info(`🧾 Order saved for business ${business_id}: ${JSON.stringify(items)}`);

  return {
    success: true,
    message: `Order placed for ${items.map(i => i.name).join(', ')}`,
    order_id: saved.id
  };
}

module.exports = { executeOrderIntent };
