#!/bin/sh
set -eu

POSTGRES_USER="${POSTGRES_USER:-postgres}"
POSTGRES_DB="${POSTGRES_DB:-postgres}"
PROJECT_INIT_MARKER="${PROJECT_INIT_MARKER:-track_binocle_20260503}"
SCHEMA_FILE="${SCHEMA_FILE:-/project-init/01-schema.sql}"
SEED_FILE="${SEED_FILE:-/project-init/02-seed.sql}"
APP_SCHEMA="${APP_SCHEMA:-public}"
export PGOPTIONS="-c search_path=${APP_SCHEMA}"

until pg_isready -h postgres -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1; do
  sleep 1
done

psql -h postgres -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 <<SQL
CREATE SCHEMA IF NOT EXISTS ${APP_SCHEMA};
CREATE TABLE IF NOT EXISTS mini_baas_project_init_markers (
  marker TEXT PRIMARY KEY,
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
SQL

already_applied="$(psql -h postgres -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "SELECT 1 FROM mini_baas_project_init_markers WHERE marker = '$PROJECT_INIT_MARKER' LIMIT 1")"

if [ "$already_applied" = "1" ]; then
  echo "Project SQL already applied: $PROJECT_INIT_MARKER"
  exit 0
fi

if [ ! -f "$SCHEMA_FILE" ]; then
  echo "Schema file not found: $SCHEMA_FILE" >&2
  exit 1
fi

if [ ! -f "$SEED_FILE" ]; then
  echo "Seed file not found: $SEED_FILE" >&2
  exit 1
fi

echo "Applying project schema: $SCHEMA_FILE"
psql -h postgres -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -f "$SCHEMA_FILE"

echo "Applying project seed: $SEED_FILE"
psql -h postgres -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -f "$SEED_FILE"

psql -h postgres -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
  END IF;
END
\$\$;

ALTER ROLE service_role BYPASSRLS;

GRANT USAGE ON SCHEMA ${APP_SCHEMA} TO anon, authenticated, service_role;
GRANT SELECT, INSERT ON ${APP_SCHEMA}.users TO anon;
GRANT SELECT ON ${APP_SCHEMA}.user_activities TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON ${APP_SCHEMA}.users, ${APP_SCHEMA}.user_activities TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ${APP_SCHEMA} TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA ${APP_SCHEMA} TO anon, authenticated, service_role;

ALTER TABLE ${APP_SCHEMA}.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE ${APP_SCHEMA}.user_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE ${APP_SCHEMA}.user_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE ${APP_SCHEMA}.sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS users_public_read ON ${APP_SCHEMA}.users;
CREATE POLICY users_public_read ON ${APP_SCHEMA}.users FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS users_public_insert ON ${APP_SCHEMA}.users;
CREATE POLICY users_public_insert ON ${APP_SCHEMA}.users FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS activities_public_read ON ${APP_SCHEMA}.user_activities;
CREATE POLICY activities_public_read ON ${APP_SCHEMA}.user_activities FOR SELECT TO anon, authenticated USING (true);

INSERT INTO mini_baas_project_init_markers (marker)
VALUES ('$PROJECT_INIT_MARKER')
ON CONFLICT (marker) DO NOTHING;
SQL

echo "Project SQL applied: $PROJECT_INIT_MARKER"
