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
