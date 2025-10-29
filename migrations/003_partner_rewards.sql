-- Create partner registry
CREATE TABLE IF NOT EXISTS partners (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  country TEXT,
  referral_code TEXT UNIQUE NOT NULL,
  jwt_secret TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  accepted_terms BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Track referrals per partner
CREATE TABLE IF NOT EXISTS partner_referrals (
  id SERIAL PRIMARY KEY,
  partner_id INTEGER REFERENCES partners(id) ON DELETE CASCADE,
  tenant_id INTEGER REFERENCES master_tenants(id) ON DELETE CASCADE,
  reward_status TEXT DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Ledger of all reward events
CREATE TABLE IF NOT EXISTS partner_rewards_ledger (
  id SERIAL PRIMARY KEY,
  partner_id INTEGER REFERENCES partners(id) ON DELETE CASCADE,
  referral_id INTEGER REFERENCES partner_referrals(id) ON DELETE CASCADE,
  reward_amount NUMERIC(10,2),
  currency TEXT DEFAULT 'USD',
  event_type TEXT CHECK (event_type IN ('credit','debit','expire')),
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
