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

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS projects_owner_crud ON public.projects;
CREATE POLICY projects_owner_crud ON public.projects
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

-- Grant SELECT on users to anon role (for public info)
GRANT SELECT ON public.users TO anon;
