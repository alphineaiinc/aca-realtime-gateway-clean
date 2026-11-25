# Global readiness evidence matrix

Pinned source: 2813610fa4df452b46e0297542f32824b1a911e5. No country or language is certified by this document. U = unverified, not unavailable. No provider purchases or calls authorized.

## Countries

| Market | Local inbound | Carrier integration | Payment/regulatory acceptance |
|---|---|---|---|
| Canada | U | U | U |
| United States | U | U | U |
| Algeria | U | U | U |
| Angola | U | U | U |
| Benin | U | U | U |
| Botswana | U | U | U |
| Burkina Faso | U | U | U |
| Burundi | U | U | U |
| Cabo Verde | U | U | U |
| Cameroon | U | U | U |
| Central African Republic | U | U | U |
| Chad | U | U | U |
| Comoros | U | U | U |
| Republic of the Congo | U | U | U |
| Democratic Republic of the Congo | U | U | U |
| Cote d'Ivoire | U | U | U |
| Djibouti | U | U | U |
| Egypt | U | U | U |
| Equatorial Guinea | U | U | U |
| Eritrea | U | U | U |
| Eswatini | U | U | U |
| Ethiopia | U | U | U |
| Gabon | U | U | U |
| Gambia | U | U | U |
| Ghana | U | U | U |
| Guinea | U | U | U |
| Guinea-Bissau | U | U | U |
| Kenya | U | U | U |
| Lesotho | U | U | U |
| Liberia | U | U | U |
| Libya | U | U | U |
| Madagascar | U | U | U |
| Malawi | U | U | U |
| Mali | U | U | U |
| Mauritania | U | U | U |
| Mauritius | U | U | U |
| Morocco | U | U | U |
| Mozambique | U | U | U |
| Namibia | U | U | U |
| Niger | U | U | U |
| Nigeria | U | Priority: verify +234 local carrier/SIP and inbound rights | U |
| Rwanda | U | U | U |
| Sao Tome and Principe | U | U | U |
| Senegal | U | U | U |
| Seychelles | U | U | U |
| Sierra Leone | U | U | U |
| Somalia | U | U | U |
| South Africa | U | U | U |
| South Sudan | U | U | U |
| Sudan | U | U | U |
| Tanzania | U | U | U |
| Togo | U | U | U |
| Tunisia | U | U | U |
| Uganda | U | U | U |
| Zambia | U | U | U |
| Zimbabwe | U | U | U |

## Language matrix

| Language | STT | LLM workflow | TTS | End-to-end |
|---|---|---|---|---|
| English | U | U | U | U |
| Nigerian English | U | U | U | U |
| Nigerian Pidgin | U | U | U | U |
| Yoruba | U | U | U | U |
| Hausa | U | U | U | U |
| Igbo | U | U | U | U |
| French | U | U | U | U |
| Swahili | U | U | U | U |
| Arabic | U | U | U | U |
| Afrikaans | U | U | U | U |
| Zulu | U | U | U | U |
| Amharic | U | U | U | U |
| Portuguese | U | U | U | U |
| Spanish | U | U | U | U |
| Hindi | U | U | U | U |
| Tamil | U | U | U | U |
| Telugu | U | U | U | U |
| Malayalam | U | U | U | U |
| Kannada | U | U | U | U |
| Bengali | U | U | U | U |
| Urdu | U | U | U | U |
| Mandarin | U | U | U | U |
| German | U | U | U | U |
| Italian | U | U | U | U |
| Japanese | U | U | U | U |
| Korean | U | U | U | U |
| Russian | U | U | U | U |

## Source evidence and carrier gates

- src/routes/tenant.js stores preferred_lang and region; this is not a language or country entitlement check.
- src/routes/twilio.js uses routing.languageCode and English-specific parsing; Twilio-specific webhook and media transport. E.164 syntax is not proof of number ownership or inbound availability.
- Nigeria: evaluate existing-number forwarding, licensed local SIP carrier and Twilio BYOC interoperability; none verified. Require written provider coverage, lawful routing, authenticated ingress, tenant binding, codec compatibility, positive call and cost approval before activation.
- Other African markets: apply the same gates individually. No blanket coverage claim.
- src/routes/billing.js: trusted invoicing and invoice email disabled; direct payment marking denied. Verify country/currency/provider settlement before activation.
- API: docs/aca/commercial-api-draft.json is a partial source-derived contract. Privileged provisioning key must never be distributed. Positive hosted onboarding and response schemas pending.
- Track in existing #129–134; no new stories. CAP-001: preserve current release candidate; documentation does not authorize deployment.
