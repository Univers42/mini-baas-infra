CREATE SCHEMA IF NOT EXISTS auth;

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
