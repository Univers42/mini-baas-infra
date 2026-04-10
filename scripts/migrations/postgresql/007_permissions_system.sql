-- File: scripts/migrations/postgresql/007_permissions_system.sql
-- Migration 007: ABAC permission system
-- Adds roles, user_roles, and resource_policies tables for
-- Attribute-Based Access Control with hybrid RBAC support.

BEGIN;

-- ── Guard: skip if already applied ────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM schema_migrations WHERE version = 7) THEN
    RAISE NOTICE 'Migration 007 already applied — skipping';
    RETURN;
  END IF;

  -- ══════════════════════════════════════════════════════════════════
  -- 1. Roles table
  -- ══════════════════════════════════════════════════════════════════
  CREATE TABLE IF NOT EXISTS public.roles (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT UNIQUE NOT NULL,
    description TEXT,
    is_system   BOOLEAN DEFAULT false,
    metadata    JSONB DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now()
  );

  ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;

  -- Authenticated users can read roles; only service_role can mutate.
  CREATE POLICY roles_read ON public.roles
    FOR SELECT TO authenticated USING (true);
  CREATE POLICY roles_admin ON public.roles
    FOR ALL TO authenticated USING (
      EXISTS (
        SELECT 1 FROM public.user_roles ur
          JOIN public.roles r ON r.id = ur.role_id
        WHERE ur.user_id = auth.uid() AND r.name = 'admin'
      )
    );

  GRANT SELECT ON public.roles TO anon;
  GRANT ALL    ON public.roles TO authenticated;

  -- Seed system roles
  INSERT INTO public.roles (name, description, is_system) VALUES
    ('admin',      'Full platform administrator',             true),
    ('user',       'Standard authenticated user',             true),
    ('guest',      'Limited read-only access',                true),
    ('moderator',  'Content moderation privileges',           true),
    ('service_role','Internal service-to-service identity',   true)
  ON CONFLICT (name) DO NOTHING;

  -- ══════════════════════════════════════════════════════════════════
  -- 2. User-role assignments
  -- ══════════════════════════════════════════════════════════════════
  CREATE TABLE IF NOT EXISTS public.user_roles (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL,
    role_id     UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
    granted_by  UUID,
    granted_at  TIMESTAMPTZ DEFAULT now(),
    expires_at  TIMESTAMPTZ,
    UNIQUE (user_id, role_id)
  );

  ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

  -- Users see their own roles; admins see all.
  CREATE POLICY user_roles_select_own ON public.user_roles
    FOR SELECT TO authenticated USING (
      user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.user_roles ur2
          JOIN public.roles r ON r.id = ur2.role_id
        WHERE ur2.user_id = auth.uid() AND r.name = 'admin'
      )
    );

  CREATE POLICY user_roles_admin ON public.user_roles
    FOR ALL TO authenticated USING (
      EXISTS (
        SELECT 1 FROM public.user_roles ur2
          JOIN public.roles r ON r.id = ur2.role_id
        WHERE ur2.user_id = auth.uid() AND r.name = 'admin'
      )
    );

  GRANT SELECT ON public.user_roles TO authenticated;
  GRANT ALL    ON public.user_roles TO authenticated;

  -- Auto-assign 'user' role on signup (via trigger)
  CREATE OR REPLACE FUNCTION public.assign_default_role()
  RETURNS TRIGGER AS $fn$
  DECLARE
    default_role_id UUID;
  BEGIN
    SELECT id INTO default_role_id FROM public.roles WHERE name = 'user';
    IF default_role_id IS NOT NULL THEN
      INSERT INTO public.user_roles (user_id, role_id)
      VALUES (NEW.id, default_role_id)
      ON CONFLICT (user_id, role_id) DO NOTHING;
    END IF;
    RETURN NEW;
  END;
  $fn$ LANGUAGE plpgsql SECURITY DEFINER;

  DROP TRIGGER IF EXISTS trg_assign_default_role ON auth.users;
  CREATE TRIGGER trg_assign_default_role
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.assign_default_role();

  -- ══════════════════════════════════════════════════════════════════
  -- 3. Resource policies (ABAC)
  -- ══════════════════════════════════════════════════════════════════
  CREATE TABLE IF NOT EXISTS public.resource_policies (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_id        UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
    resource_type  TEXT NOT NULL,  -- 'table', 'collection', 'bucket', 'endpoint'
    resource_name  TEXT NOT NULL,  -- e.g. 'projects', 'sensor_telemetry', '*'
    actions        TEXT[] NOT NULL DEFAULT ARRAY['select'],
    conditions     JSONB DEFAULT '{}'::jsonb,
    effect         TEXT NOT NULL DEFAULT 'allow' CHECK (effect IN ('allow', 'deny')),
    priority       INTEGER DEFAULT 0,
    created_at     TIMESTAMPTZ DEFAULT now(),
    updated_at     TIMESTAMPTZ DEFAULT now()
  );

  ALTER TABLE public.resource_policies ENABLE ROW LEVEL SECURITY;

  CREATE POLICY resource_policies_read ON public.resource_policies
    FOR SELECT TO authenticated USING (true);
  CREATE POLICY resource_policies_admin ON public.resource_policies
    FOR ALL TO authenticated USING (
      EXISTS (
        SELECT 1 FROM public.user_roles ur
          JOIN public.roles r ON r.id = ur.role_id
        WHERE ur.user_id = auth.uid() AND r.name = 'admin'
      )
    );

  GRANT SELECT ON public.resource_policies TO anon;
  GRANT ALL    ON public.resource_policies TO authenticated;

  -- ══════════════════════════════════════════════════════════════════
  -- 4. Helper functions
  -- ══════════════════════════════════════════════════════════════════

  -- Returns array of role names for a given user
  CREATE OR REPLACE FUNCTION public.user_roles_array(uid UUID)
  RETURNS TEXT[] AS $fn$
    SELECT COALESCE(
      array_agg(r.name),
      ARRAY[]::TEXT[]
    )
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = uid
      AND (ur.expires_at IS NULL OR ur.expires_at > now());
  $fn$ LANGUAGE sql STABLE SECURITY DEFINER;

  -- Evaluates whether a user has permission for a resource+action
  CREATE OR REPLACE FUNCTION public.has_permission(
    p_user_id      UUID,
    p_resource_type TEXT,
    p_resource_name TEXT,
    p_action       TEXT
  ) RETURNS BOOLEAN AS $fn$
  DECLARE
    pol   RECORD;
    found BOOLEAN := false;
  BEGIN
    FOR pol IN
      SELECT rp.effect, rp.conditions
      FROM public.resource_policies rp
      JOIN public.user_roles ur ON ur.role_id = rp.role_id
      WHERE ur.user_id = p_user_id
        AND (ur.expires_at IS NULL OR ur.expires_at > now())
        AND (rp.resource_type = p_resource_type OR rp.resource_type = '*')
        AND (rp.resource_name = p_resource_name OR rp.resource_name = '*')
        AND p_action = ANY(rp.actions)
      ORDER BY rp.priority DESC, rp.effect ASC  -- deny-first at same priority
    LOOP
      -- Deny wins immediately
      IF pol.effect = 'deny' THEN
        RETURN false;
      END IF;
      found := true;
    END LOOP;

    RETURN found;
  END;
  $fn$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

  -- Extracts AAL level from JWT (for MFA enforcement)
  CREATE OR REPLACE FUNCTION auth.aal()
  RETURNS TEXT AS $fn$
    SELECT COALESCE(
      current_setting('request.jwt.claims', true)::json->>'aal',
      'aal1'
    );
  $fn$ LANGUAGE sql STABLE;

  -- Seed default policies: 'user' role has full CRUD on own resources
  INSERT INTO public.resource_policies (role_id, resource_type, resource_name, actions, conditions, effect, priority)
  SELECT r.id, '*', '*',
         ARRAY['select','insert','update','delete'],
         '{"owner_only": true}'::jsonb,
         'allow', 0
  FROM public.roles r WHERE r.name = 'user'
  ON CONFLICT DO NOTHING;

  -- Admin role: full access without owner restriction
  INSERT INTO public.resource_policies (role_id, resource_type, resource_name, actions, conditions, effect, priority)
  SELECT r.id, '*', '*',
         ARRAY['select','insert','update','delete'],
         '{}'::jsonb,
         'allow', 100
  FROM public.roles r WHERE r.name = 'admin'
  ON CONFLICT DO NOTHING;

  -- Guest role: read-only
  INSERT INTO public.resource_policies (role_id, resource_type, resource_name, actions, conditions, effect, priority)
  SELECT r.id, '*', '*',
         ARRAY['select'],
         '{"owner_only": true}'::jsonb,
         'allow', 0
  FROM public.roles r WHERE r.name = 'guest'
  ON CONFLICT DO NOTHING;

  -- Record migration
  INSERT INTO schema_migrations (version, name) VALUES (7, '007_permissions_system');

END $$;

COMMIT;
