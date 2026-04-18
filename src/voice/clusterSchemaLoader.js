"use strict";

const path = require("path");
const fs = require("fs");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

let pool = null;
try {
  pool = require("../db/pool");
} catch (err) {
  try {
    pool = require("../../aca-orchestrator/src/db/pool");
  } catch (innerErr) {
    console.warn("[clusterSchemaLoader] DB pool module not found in default locations");
  }
}

function buildNeutralFallbackSchema(clusterId = "generic_service") {
  return {
    cluster_id: clusterId,
    version: 1,
    intents: [],
    slot_definitions: {},
    voice_rules: {
      max_words: 22,
      avoid_repetition: true,
      single_question_only: true
    },
    workflow_rules: {
      require_allowed_intent: true,
      allow_intent_switch: true,
      require_schema_slots_only: true
    }
  };
}

function normalizeSchema(rawSchema, clusterId) {
  if (!rawSchema || typeof rawSchema !== "object") {
    return buildNeutralFallbackSchema(clusterId);
  }

  return {
    cluster_id: rawSchema.cluster_id || clusterId || "generic_service",
    version: rawSchema.version || 1,
    intents: Array.isArray(rawSchema.intents) ? rawSchema.intents : [],
    slot_definitions:
      rawSchema.slot_definitions && typeof rawSchema.slot_definitions === "object"
        ? rawSchema.slot_definitions
        : {},
    voice_rules: {
      max_words: rawSchema.voice_rules?.max_words || 22,
      avoid_repetition:
        typeof rawSchema.voice_rules?.avoid_repetition === "boolean"
          ? rawSchema.voice_rules.avoid_repetition
          : true,
      single_question_only:
        typeof rawSchema.voice_rules?.single_question_only === "boolean"
          ? rawSchema.voice_rules.single_question_only
          : true
    },
    workflow_rules: {
      require_allowed_intent:
        typeof rawSchema.workflow_rules?.require_allowed_intent === "boolean"
          ? rawSchema.workflow_rules.require_allowed_intent
          : true,
      allow_intent_switch:
        typeof rawSchema.workflow_rules?.allow_intent_switch === "boolean"
          ? rawSchema.workflow_rules.allow_intent_switch
          : true,
      require_schema_slots_only:
        typeof rawSchema.workflow_rules?.require_schema_slots_only === "boolean"
          ? rawSchema.workflow_rules.require_schema_slots_only
          : true
    }
  };
}

async function loadClusterSchemaFromDb(clusterId) {
  if (!clusterId || !pool || !pool.query) return null;

  const queryVariants = [
    `
      SELECT
        cluster_id,
        version,
        schema_json
      FROM cluster_schemas
      WHERE cluster_id = $1
        AND COALESCE(is_active, true) = true
      ORDER BY version DESC
      LIMIT 1
    `,
    `
      SELECT
        id AS cluster_id,
        version,
        schema_json
      FROM clusters
      WHERE id = $1
      LIMIT 1
    `
  ];

  for (const sql of queryVariants) {
    try {
      const result = await pool.query(sql, [clusterId]);
      const row = result.rows[0];
      if (row) {
        return normalizeSchema(
          row.schema_json || row.schema || {},
          row.cluster_id || clusterId
        );
      }
    } catch (err) {
      console.warn("[clusterSchemaLoader] DB schema lookup skipped:", err.message);
    }
  }

  return null;
}

function tryReadLocalSchemaFile(clusterId) {
  if (!clusterId) return null;

  const candidatePaths = [
    path.resolve(process.cwd(), "config", "clusters", `${clusterId}.json`),
    path.resolve(process.cwd(), "src", "config", "clusters", `${clusterId}.json`),
    path.resolve(__dirname, "..", "..", "config", "clusters", `${clusterId}.json`)
  ];

  for (const filePath of candidatePaths) {
    try {
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, "utf8");
        const parsed = JSON.parse(raw);
        return normalizeSchema(parsed, clusterId);
      }
    } catch (err) {
      console.warn("[clusterSchemaLoader] local schema file skipped:", err.message);
    }
  }

  return null;
}

async function loadClusterSchema(clusterId) {
  if (!clusterId) {
    return buildNeutralFallbackSchema("generic_service");
  }

  const dbSchema = await loadClusterSchemaFromDb(clusterId);
  if (dbSchema) return dbSchema;

  const localSchema = tryReadLocalSchemaFile(clusterId);
  if (localSchema) return localSchema;

  return buildNeutralFallbackSchema(clusterId);
}

module.exports = {
  buildNeutralFallbackSchema,
  normalizeSchema,
  loadClusterSchema
};