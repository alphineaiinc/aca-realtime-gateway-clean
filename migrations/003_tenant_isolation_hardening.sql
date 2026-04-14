-- 003_tenant_isolation_hardening.sql
-- Story 12.8.3 — Strict Tenant Isolation Hardening (DB guardrails)
-- Safe-by-default: uses guarded DO blocks so deploy won't fail if table absent.

BEGIN;

-- ------------------------------------------------------------
-- knowledge_base table (used by retriever.js)
-- Ensure tenant_id exists and index tenant_id for fast isolation queries
-- ------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'knowledge_base'
  ) THEN

    -- Ensure tenant_id column exists
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='knowledge_base' AND column_name='tenant_id'
    ) THEN
      ALTER TABLE public.knowledge_base ADD COLUMN tenant_id BIGINT;
    END IF;

    -- Best-effort NOT NULL (only if table is empty or values exist)
    -- (If there are NULLs, this will fail; comment out if needed.)
    BEGIN
      ALTER TABLE public.knowledge_base ALTER COLUMN tenant_id SET NOT NULL;
    EXCEPTION WHEN others THEN
      -- leave as-is if existing data prevents it
    END;

    -- Tenant isolation index
    CREATE INDEX IF NOT EXISTS knowledge_base_tenant_id_idx
      ON public.knowledge_base (tenant_id);

    -- Optional composite index for common access patterns
    CREATE INDEX IF NOT EXISTS knowledge_base_tenant_id_id_idx
      ON public.knowledge_base (tenant_id, id);

  END IF;
END
$$;

-- ------------------------------------------------------------
-- kb_entries table (used by brain.js)
-- Ensure tenant_id exists and index tenant_id
-- ------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'kb_entries'
  ) THEN

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='kb_entries' AND column_name='tenant_id'
    ) THEN
      ALTER TABLE public.kb_entries ADD COLUMN tenant_id BIGINT;
    END IF;

    BEGIN
      ALTER TABLE public.kb_entries ALTER COLUMN tenant_id SET NOT NULL;
    EXCEPTION WHEN others THEN
      -- leave as-is if existing data prevents it
    END;

    CREATE INDEX IF NOT EXISTS kb_entries_tenant_id_idx
      ON public.kb_entries (tenant_id);

    CREATE INDEX IF NOT EXISTS kb_entries_tenant_id_id_idx
      ON public.kb_entries (tenant_id, id);

  END IF;
END
$$;

COMMIT;
