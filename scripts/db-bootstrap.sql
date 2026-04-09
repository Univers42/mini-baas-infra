CREATE SCHEMA IF NOT EXISTS auth;

ALTER ROLE postgres IN DATABASE postgres SET search_path = auth, public;

SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') AS anon_role_exists
\gset

\if :anon_role_exists
\else
CREATE ROLE anon NOLOGIN;
\endif

SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') AS authenticated_role_exists
\gset

\if :authenticated_role_exists
\else
CREATE ROLE authenticated NOLOGIN;
\endif

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon, authenticated;

SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_admin') AS role_exists
\gset

\if :role_exists
ALTER ROLE supabase_admin
  WITH LOGIN
  SUPERUSER
  CREATEDB
  CREATEROLE
  REPLICATION
  BYPASSRLS
  PASSWORD :'pwd';
\else
CREATE ROLE supabase_admin
  LOGIN
  SUPERUSER
  CREATEDB
  CREATEROLE
  REPLICATION
  BYPASSRLS
  PASSWORD :'pwd';
\endif

SELECT format('CREATE DATABASE %I', :'realtime_db')
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'realtime_db')
\gexec

-- Create a helper function for JWT extraction FIRST (before policies that use it)
CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID AS $$
  SELECT (current_setting('request.jwt.claims', true)::jsonb->>'sub')::uuid;
$$ LANGUAGE SQL STABLE;

-- Create test tables for authenticated user testing
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  bio TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT,
  is_public BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on test tables
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

-- **MVP: projects table for demo**
CREATE TABLE IF NOT EXISTS public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'archived')),
  owner_id TEXT NOT NULL,  -- JWT subject, enforced by RLS
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Mock relational schema for MVP dual-data-plane demo
CREATE TABLE IF NOT EXISTS public.mock_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id TEXT NOT NULL,
  order_number TEXT NOT NULL UNIQUE,
  currency TEXT NOT NULL DEFAULT 'USD',
  total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'cancelled')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mock_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS projects_owner_crud ON public.projects;
CREATE POLICY projects_owner_crud ON public.projects
  FOR ALL USING (
    auth.uid()::text = owner_id
  )
  WITH CHECK (
    auth.uid()::text = owner_id
  );

DROP POLICY IF EXISTS mock_orders_owner_crud ON public.mock_orders;
CREATE POLICY mock_orders_owner_crud ON public.mock_orders
  FOR ALL USING (
    auth.uid()::text = owner_id
  )
  WITH CHECK (
    auth.uid()::text = owner_id
  );

-- **RLS policies: strict ownership enforcement (no OR true)**
DROP POLICY IF EXISTS users_select_own ON public.users;
CREATE POLICY users_select_own ON public.users
  FOR SELECT USING (
    auth.uid()::text = id::text
  );

DROP POLICY IF EXISTS user_profiles_select_own ON public.user_profiles;
CREATE POLICY user_profiles_select_own ON public.user_profiles
  FOR SELECT USING (
    auth.uid()::text = user_id::text
  );

DROP POLICY IF EXISTS posts_select ON public.posts;
CREATE POLICY posts_select ON public.posts
  FOR SELECT USING (
    is_public OR auth.uid()::text = user_id::text
  );

-- Grant access to authenticated role
GRANT SELECT, INSERT, UPDATE, DELETE ON public.users TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.posts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mock_orders TO authenticated;

-- Grant SELECT on users to anon role (for public info)
GRANT SELECT ON public.users TO anon;

-- ─── Adapter-registry limited role ───────────────────────────────
-- This role is used by the adapter-registry service. It can NOT
-- bypass RLS, so every query against tenant_databases is filtered
-- by the current_setting('app.current_user_id') set per-transaction.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'adapter_registry_role') THEN
    CREATE ROLE adapter_registry_role LOGIN PASSWORD 'adapter_registry_pw';
  END IF;
END $$;

-- Create the adapter-registry table early so GRANTs and RLS succeed
CREATE TABLE IF NOT EXISTS public.tenant_databases (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        TEXT NOT NULL,
  engine           TEXT NOT NULL CHECK (engine IN ('postgresql','mongodb','mysql','redis','sqlite')),
  name             TEXT NOT NULL,
  connection_enc   BYTEA NOT NULL,
  connection_iv    BYTEA NOT NULL,
  connection_tag   BYTEA NOT NULL,
  connection_salt  BYTEA,
  created_at       TIMESTAMPTZ DEFAULT now(),
  last_healthy_at  TIMESTAMPTZ,
  UNIQUE(tenant_id, name)
);

GRANT CONNECT ON DATABASE postgres TO adapter_registry_role;
GRANT USAGE ON SCHEMA public TO adapter_registry_role;
GRANT SELECT, INSERT ON public.tenant_databases TO adapter_registry_role;

-- Enable RLS on the adapter-registry table
ALTER TABLE public.tenant_databases ENABLE ROW LEVEL SECURITY;
-- Force RLS even for the table owner (superuser is still exempt)
ALTER TABLE public.tenant_databases FORCE ROW LEVEL SECURITY;

-- SELECT: tenant can only see own rows
DROP POLICY IF EXISTS tenant_databases_select ON public.tenant_databases;
CREATE POLICY tenant_databases_select ON public.tenant_databases
  FOR SELECT USING (
    tenant_id = current_setting('app.current_user_id', true)
  );

-- INSERT: tenant can only insert rows for themselves
DROP POLICY IF EXISTS tenant_databases_insert ON public.tenant_databases;
CREATE POLICY tenant_databases_insert ON public.tenant_databases
  FOR INSERT WITH CHECK (
    tenant_id = current_setting('app.current_user_id', true)
  );

-- UPDATE: only last_healthy_at may be touched, and only own rows
DROP POLICY IF EXISTS tenant_databases_update ON public.tenant_databases;
CREATE POLICY tenant_databases_update ON public.tenant_databases
  FOR UPDATE USING (
    tenant_id = current_setting('app.current_user_id', true)
  ) WITH CHECK (
    tenant_id = current_setting('app.current_user_id', true)
  );
GRANT UPDATE (last_healthy_at) ON public.tenant_databases TO adapter_registry_role;
