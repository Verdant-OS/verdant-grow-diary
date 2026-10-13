#!/usr/bin/env bash
# Create a uniquely named local database, load a schema-only dump of the
# already-migrated local Supabase database, set a runner-issued token, run
# supabase/tests/badge_awards_permissions.sql, and always drop the database.
#
# The dump is not a 272-file migration replay. It copies the local schema,
# including grants, after the owner-badge migration is already applied.
# The singleton runtime row and the diary-photos bucket are data, so the
# runner inserts those two empty fixtures after the load. It copies no users.
# This script never connects to a hosted database and never opens dbname=postgres
# for the committing plan.
#
# Usage:
#   scripts/run-badge-pgtap-disposable.sh
#   scripts/run-badge-pgtap-disposable.sh --sql supabase/tests/badge_awards_permissions.sql
#   scripts/run-badge-pgtap-disposable.sh --sql supabase/tests/badge_awards_permissions.sql --wrong-token
#   scripts/run-badge-pgtap-disposable.sh --sql supabase/tests/badge_awards_permissions.sql --missing-token
#   scripts/run-badge-pgtap-disposable.sh --sql supabase/tests/badge_awards_permissions.sql --seed-nonempty
#   scripts/run-badge-pgtap-disposable.sh --sql supabase/tests/badge_awards_permissions.sql --force-session2-failure
#
# --sql accepts only supabase/tests/badge_awards_permissions.sql. Any other
# path exits 2. Omitting --sql still runs that same file.
#
# BADGE_PGTAP_SCHEMA_FILE, when set, reuses that schema dump instead of
# running pg_dump again. The database is still created and dropped here.
# BADGE_PGTAP_DB_NAME forces the database name. The drop target is set
# only after CREATE DATABASE succeeds, so a collision leaves the existing
# database in place.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SQL_REL="supabase/tests/badge_awards_permissions.sql"
SQL_FILE="$ROOT/$SQL_REL"
HOST="${PGHOST:-127.0.0.1}"
PORT="${PGPORT:-54322}"
PGUSER="${PGUSER:-postgres}"
export PGPASSWORD="${PGPASSWORD:-postgres}"
MODE="happy"
DB_NAME=""
DUMP=""
OWN_DUMP=0

case "$HOST" in
  127.0.0.1 | localhost | ::1) ;;
  *)
    echo "refusing non-loopback host $HOST" >&2
    exit 2
    ;;
esac

while [[ $# -gt 0 ]]; do
  case "$1" in
    --sql)
      if [[ $# -lt 2 ]]; then
        echo "missing path after --sql" >&2
        exit 2
      fi
      if [[ "$2" != "$SQL_REL" ]]; then
        echo "refusing sql path $2" >&2
        exit 2
      fi
      shift 2
      ;;
    --wrong-token) MODE="wrong-token"; shift ;;
    --missing-token) MODE="missing-token"; shift ;;
    --seed-nonempty) MODE="seed-nonempty"; shift ;;
    --force-session2-failure) MODE="force-session2-failure"; shift ;;
    *)
      echo "unknown mode: $1" >&2
      exit 2
      ;;
  esac
done

psql_admin() {
  psql -h "$HOST" -p "$PORT" -U "$PGUSER" -d postgres -v ON_ERROR_STOP=1 "$@"
}

psql_db() {
  psql -h "$HOST" -p "$PORT" -U "$PGUSER" -d "$DB_NAME" -v ON_ERROR_STOP=1 "$@"
}

cleanup() {
  local status=$?
  if [[ -n "$DB_NAME" ]]; then
    local attempt dropped=0
    for attempt in 1 2 3 4 5; do
      psql_admin -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${DB_NAME}' AND pid <> pg_backend_pid();" >/dev/null 2>&1 || true
      if psql_admin -c "DROP DATABASE IF EXISTS ${DB_NAME};" >/dev/null 2>&1; then
        dropped=1
        break
      fi
      sleep 0.2
    done
    if [[ "$dropped" -ne 1 ]]; then
      echo "failed to drop ${DB_NAME}" >&2
      status=1
    fi
  fi
  if [[ "$OWN_DUMP" -eq 1 && -n "$DUMP" ]]; then
    rm -f "$DUMP"
  fi
  exit "$status"
}
trap cleanup EXIT

mapfile -t containers < <(docker ps --format '{{.Names}}' | grep '^supabase_db_' || true)
if [[ "${#containers[@]}" -ne 1 ]]; then
  echo "expected one supabase_db_ container, found ${#containers[@]}" >&2
  exit 2
fi
CONTAINER="${containers[0]}"

TOKEN="$(openssl rand -hex 32)"
# DB_NAME is the drop target. It stays empty until CREATE DATABASE
# succeeds, so a name collision cannot drop a database this run did not create.
candidate="${BADGE_PGTAP_DB_NAME:-badge_pgtap_$(openssl rand -hex 6)}"
if [[ ! "$candidate" =~ ^badge_pgtap_[0-9a-f]{12}$ ]]; then
  echo "refusing unexpected database name $candidate" >&2
  exit 2
fi

echo "badge pgTAP database ${candidate} mode ${MODE}"
if ! psql_admin -c "CREATE DATABASE ${candidate} TEMPLATE template0;" >/dev/null; then
  echo "CREATE DATABASE ${candidate} failed; leaving any existing database in place" >&2
  exit 1
fi
DB_NAME="$candidate"

if [[ -n "${BADGE_PGTAP_SCHEMA_FILE:-}" ]]; then
  DUMP="$BADGE_PGTAP_SCHEMA_FILE"
  if [[ ! -f "$DUMP" ]]; then
    echo "schema file not found: $DUMP" >&2
    exit 2
  fi
else
  DUMP="$(mktemp /tmp/badge-pgtap-schema.XXXXXX.sql)"
  OWN_DUMP=1
  docker exec "$CONTAINER" pg_dump -U supabase_admin --schema-only --no-owner --exclude-extension=pg_cron postgres \
    | sed '/^\\restrict /d;/^\\unrestrict /d' >"$DUMP"
fi

# supabase_admin can install function SET clauses the postgres role cannot.
# pg_cron is excluded from the dump. Its default privileges still name the
# cron schema, so that empty schema has to exist before the load. cron.job
# stays absent, and the permissions file skips the schedule check.
docker exec -i "$CONTAINER" psql -U supabase_admin -d "$DB_NAME" -v ON_ERROR_STOP=1 \
  -c "CREATE SCHEMA IF NOT EXISTS cron;" >/dev/null
docker exec -i "$CONTAINER" psql -U supabase_admin -d "$DB_NAME" -v ON_ERROR_STOP=1 <"$DUMP" >/dev/null

# The migration inserts the singleton switch row. A schema-only dump does not.
admin_sql() {
  docker exec -i "$CONTAINER" psql -U supabase_admin -d "$DB_NAME" -v ON_ERROR_STOP=1 -c "$1" >/dev/null
}
admin_sql "INSERT INTO public.badge_award_runtime (id, enabled) VALUES (1, false);"
admin_sql "INSERT INTO storage.buckets (id, name, public) VALUES ('diary-photos', 'diary-photos', false);"
# --no-owner leaves supabase_admin as owner. The long-lived local database
# grants postgres the table rights it uses before SET ROLE.
admin_sql "GRANT CREATE, USAGE ON SCHEMA public TO postgres;"
admin_sql "GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO postgres;"
admin_sql "GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO postgres;"
admin_sql "GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO postgres;"
admin_sql "ALTER TABLE public.badge_awards OWNER TO postgres;"

empty_users="$(psql_db -tAc "SELECT CASE WHEN count(*) = 0 THEN '1' ELSE '0' END FROM auth.users;")"
[[ "$empty_users" == "1" ]] || {
  echo "schema load left auth.users rows" >&2
  exit 1
}
psql_db -c "SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'badge_awards_reconcile';" \
  | grep -q '1' || {
  echo "badge_awards_reconcile is missing after schema load" >&2
  exit 1
}

psql_db -c "COMMENT ON DATABASE ${DB_NAME} IS '${TOKEN}';" >/dev/null
# postgres may SET a custom GUC in its session, but ALTER DATABASE SET for
# that parameter is reserved for the local superuser.
case "$MODE" in
  missing-token) ;;
  wrong-token)
    admin_sql "ALTER DATABASE ${DB_NAME} SET badge_pgtap.token = 'wrong-token-not-the-comment';"
    ;;
  force-session2-failure)
    admin_sql "ALTER DATABASE ${DB_NAME} SET badge_pgtap.token = '${TOKEN}';"
    admin_sql "ALTER DATABASE ${DB_NAME} SET badge_pgtap.force_session2_failure = '1';"
    ;;
  *)
    admin_sql "ALTER DATABASE ${DB_NAME} SET badge_pgtap.token = '${TOKEN}';"
    ;;
esac

if [[ "$MODE" == "seed-nonempty" ]]; then
  psql_db -v ON_ERROR_STOP=1 -c "
    INSERT INTO auth.users (
      id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data, aud, role
    ) VALUES (
      '00000000-0000-4000-8000-000000000001',
      'badge-seed-nonempty@verdant.test',
      extensions.crypt('harness-password', extensions.gen_salt('bf')),
      now(), now(), now(), '{}'::jsonb, '{}'::jsonb, 'authenticated', 'authenticated'
    );
  " >/dev/null
fi

set +e
output="$(psql_db -f "$SQL_FILE" 2>&1)"
status=$?
set -e
printf '%s\n' "$output"

case "$MODE" in
  happy)
    if [[ "$status" -ne 0 ]]; then
      exit "$status"
    fi
    if ! printf '%s\n' "$output" | grep -qx 'ok 2 - two simultaneous sessions leave one award'; then
      echo "ok 2 did not run" >&2
      exit 1
    fi
    if printf '%s\n' "$output" | grep -q 'ok 2 - .*# SKIP'; then
      echo "ok 2 skipped on a disposable database" >&2
      exit 1
    fi
    ;;
  wrong-token)
    if [[ "$status" -eq 0 ]]; then
      echo "wrong token was accepted" >&2
      exit 1
    fi
    printf '%s\n' "$output" | grep -q 'two-session test refuses a token that does not match the database comment' \
      || {
        echo "wrong token did not trip the token fence" >&2
        exit 1
      }
    ;;
  missing-token)
    if [[ "$status" -eq 0 ]]; then
      echo "missing token was accepted" >&2
      exit 1
    fi
    printf '%s\n' "$output" | grep -q 'two-session test refuses a missing token' \
      || {
        echo "missing token did not trip the token fence" >&2
        exit 1
      }
    ;;
  seed-nonempty)
    if [[ "$status" -eq 0 ]]; then
      echo "non-empty database was accepted" >&2
      exit 1
    fi
    printf '%s\n' "$output" | grep -q 'two-session test refuses a non-empty database' \
      || {
        echo "non-empty database did not trip the empty fence" >&2
        exit 1
      }
    ;;
  force-session2-failure)
    if [[ "$status" -eq 0 ]]; then
      echo "forced session-2 failure did not fail the file" >&2
      exit 1
    fi
    printf '%s\n' "$output" | grep -q 'forced session-2 failure' \
      || {
        echo "session-2 failure was not the forced error" >&2
        exit 1
      }
    ;;
esac

exit 0
