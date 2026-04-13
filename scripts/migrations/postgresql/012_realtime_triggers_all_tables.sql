-- File: scripts/migrations/postgresql/012_realtime_triggers_all_tables.sql
-- Migration 012: Install realtime CDC triggers on ALL public tables
--
-- Instead of listing tables by name (migration 011 hardcoded 5 tables),
-- this migration:
--   1. Loops over every public BASE TABLE and attaches realtime_notify()
--   2. Creates an EVENT TRIGGER so future CREATE TABLE statements
--      automatically get the trigger installed — zero manual work.
--
-- This makes the BaaS fully generic: any application that adds tables
-- (via schema-service, raw SQL, or migrations) gets realtime CDC for free.

BEGIN;

-- ══════════════════════════════════════════════════════════════════
-- 1. Ensure the trigger function exists (idempotent)
-- ══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.realtime_notify()
RETURNS TRIGGER AS $fn$
DECLARE
  payload JSONB;
BEGIN
  payload := jsonb_build_object(
    'schema',     TG_TABLE_SCHEMA,
    'table',      TG_TABLE_NAME,
    'type',       TG_OP,
    'record',     CASE
                    WHEN TG_OP = 'DELETE' THEN row_to_json(OLD)::jsonb
                    ELSE row_to_json(NEW)::jsonb
                  END,
    'old_record', CASE
                    WHEN TG_OP = 'UPDATE' THEN row_to_json(OLD)::jsonb
                    ELSE NULL
                  END,
    'timestamp',  extract(epoch FROM now())
  );

  PERFORM pg_notify('realtime_events', payload::text);
  RETURN COALESCE(NEW, OLD);
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER;

-- ══════════════════════════════════════════════════════════════════
-- 2. Helper: attach the trigger to a single table (idempotent)
-- ══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.realtime_ensure_trigger(
  _schema TEXT,
  _table  TEXT
) RETURNS VOID AS $fn$
DECLARE
  _trigger_name TEXT := _table || '_realtime_trigger';
BEGIN
  -- Skip if the trigger already exists
  IF EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE event_object_schema = _schema
      AND event_object_table  = _table
      AND trigger_name        = _trigger_name
  ) THEN
    RETURN;
  END IF;

  EXECUTE format(
    'CREATE TRIGGER %I
       AFTER INSERT OR UPDATE OR DELETE ON %I.%I
       FOR EACH ROW EXECUTE FUNCTION public.realtime_notify()',
    _trigger_name, _schema, _table
  );

  RAISE NOTICE 'realtime trigger installed on %.%', _schema, _table;
END;
$fn$ LANGUAGE plpgsql;

-- ══════════════════════════════════════════════════════════════════
-- 3. Install triggers on ALL existing public base tables
-- ══════════════════════════════════════════════════════════════════
DO $$
DECLARE
  _rec RECORD;
BEGIN
  -- Guard: skip if already applied
  IF EXISTS (SELECT 1 FROM public.schema_migrations WHERE version = 12) THEN
    RAISE NOTICE 'Migration 012 already applied — skipping';
    RETURN;
  END IF;

  FOR _rec IN
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type   = 'BASE TABLE'
    ORDER BY table_name
  LOOP
    PERFORM public.realtime_ensure_trigger('public', _rec.table_name);
  END LOOP;

  INSERT INTO public.schema_migrations (version, name) VALUES (12, '012_realtime_triggers_all_tables');
END $$;

-- ══════════════════════════════════════════════════════════════════
-- 4. Event trigger: auto-install on future CREATE TABLE
-- ══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.realtime_auto_trigger()
RETURNS EVENT_TRIGGER AS $fn$
DECLARE
  _obj RECORD;
BEGIN
  FOR _obj IN SELECT * FROM pg_event_trigger_ddl_commands()
    WHERE command_tag = 'CREATE TABLE'
      AND schema_name = 'public'
  LOOP
    PERFORM public.realtime_ensure_trigger(
      _obj.schema_name,
      split_part(_obj.object_identity, '.', 2)
    );
  END LOOP;
END;
$fn$ LANGUAGE plpgsql;

DROP EVENT TRIGGER IF EXISTS realtime_auto_trigger_on_create;
CREATE EVENT TRIGGER realtime_auto_trigger_on_create
  ON ddl_command_end
  WHEN TAG IN ('CREATE TABLE')
  EXECUTE FUNCTION public.realtime_auto_trigger();

COMMIT;

-- DOWN (rollback)
-- DROP EVENT TRIGGER IF EXISTS realtime_auto_trigger_on_create;
-- DROP FUNCTION IF EXISTS public.realtime_auto_trigger();
-- -- To remove all per-table triggers:
-- DO $$ DECLARE _rec RECORD; BEGIN
--   FOR _rec IN SELECT trigger_name, event_object_table
--     FROM information_schema.triggers
--     WHERE trigger_name LIKE '%_realtime_trigger'
--       AND event_object_schema = 'public'
--   LOOP
--     EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', _rec.trigger_name, _rec.event_object_table);
--   END LOOP;
-- END $$;
-- DROP FUNCTION IF EXISTS public.realtime_ensure_trigger(TEXT, TEXT);
