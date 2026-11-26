"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { BUSINESS_SLOT_PROFILES, normalizeBusinessType, getBusinessSlotProfile } =
  require("../src/voice/businessSlotProfiles");
const intakeSchemas = require("../config/clusterIntakeSchemas");
const {
  getMissingRequiredSlots, getNextMissingRequiredSlot, canConfirmNow,
  getNextSlotQuestion, mergeExtractedSlots,
} = require("../src/voice/slotEnforcement");

const aliases = {
  restaurant_hospitality: "restaurant",
  medical_clinic: "medical",
  dental_vision: "medical",
  beauty_salon_spa: "salon",
  fitness_wellness: "fitness_wellness",
  auto_service: "auto_service",
  home_services: "home_services",
  legal_finance_consulting: "legal_finance_consulting",
  pet_services: "pet_services",
  real_estate_property: "real_estate_property",
  education_tutoring_training: "education_tutoring_training",
  retail_callback_and_general_service: "retail_callback_and_general_service",
};

test("all industry profiles have unique required slots and real questions", () => {
  assert.ok(Object.keys(BUSINESS_SLOT_PROFILES).length >= 10);
  for (const [name, profile] of Object.entries(BUSINESS_SLOT_PROFILES)) {
    assert.ok(profile.required.length > 0, name);
    assert.equal(new Set(profile.required).size, profile.required.length, name);
    for (const slot of profile.required) {
      assert.ok(typeof profile.slotQuestions[slot] === "string" && profile.slotQuestions[slot].trim(), name + "." + slot);
    }
  }
});

test("all intake clusters have explicit aliases and consistent required slots", () => {
  assert.deepEqual(Object.keys(intakeSchemas).sort(), Object.keys(aliases).sort());
  for (const [cluster, intake] of Object.entries(intakeSchemas)) {
    const profileName = aliases[cluster];
    assert.equal(normalizeBusinessType(cluster), profileName, cluster);
    const profile = getBusinessSlotProfile(cluster);
    assert.equal(profile, BUSINESS_SLOT_PROFILES[profileName]);
    assert.deepEqual(profile.required.filter(slot => slot !== "intent").sort(), [...intake.required].sort(), cluster);
    for (const slot of intake.confirmationFields) {
      assert.ok(intake.required.includes(slot), cluster + ": confirmation " + slot);
    }
    for (const slot of intake.notificationFields) {
      assert.ok(intake.required.includes(slot) || intake.optional.includes(slot), cluster + ": notification " + slot);
    }
  }
});

test("no industry can confirm with missing required slots", () => {
  for (const [cluster, profileName] of Object.entries(aliases)) {
    const profile = BUSINESS_SLOT_PROFILES[profileName];
    const filled = Object.fromEntries(profile.required.map(slot => [slot, slot === "phone" ? "+14165550123" : "example"]));
    assert.equal(canConfirmNow(cluster, filled), true, cluster);
    for (const slot of profile.required) {
      const partial = { ...filled };
      delete partial[slot];
      assert.equal(canConfirmNow(cluster, partial), false, cluster + ": missing " + slot);
      assert.ok(getMissingRequiredSlots(cluster, partial).includes(slot));
      assert.ok(getNextMissingRequiredSlot(cluster, partial));
      assert.ok(getNextSlotQuestion(cluster, slot).trim());
    }
  }
});

test("phone confirmation requires enough digits and corrections overwrite stale slots", () => {
  const initial = { phone: "416555", date: "2026-12-01", name: "Taylor" };
  assert.equal(canConfirmNow("retail_callback_and_general_service", { reason: "callback", name: "Taylor", phone: "416555" }), false);
  const updated = mergeExtractedSlots(initial, { phone: "(416) 555-0123", date: "2026-12-02", name: " " });
  assert.equal(updated.phone, "4165550123");
  assert.equal(updated.date, "2026-12-02");
  assert.equal(updated.name, "Taylor");
});
