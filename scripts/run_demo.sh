#!/usr/bin/env bash
# Local demo only; no cloud payments or physical hardware.
set -Eeuo pipefail
umask 077
[[ $(uname -s) == Linux ]] || { printf 'Run inside Ubuntu Linux.\n' >&2; exit 1; }
[[ $EUID -ne 0 ]] || { printf 'Run as your normal Linux user.\n' >&2; exit 1; }
repo_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
cd -- "$repo_root"
case "$repo_root" in /mnt/[a-z]/*) printf 'Use the Linux checkout.\n' >&2; exit 1;; esac
[[ -f .tools/env.sh ]] || { printf 'Run Phase 0 setup first.\n' >&2; exit 1; }
# shellcheck disable=SC1091
source .tools/env.sh
python -c 'import fastapi, uvicorn, psycopg' || { printf 'Run scripts/install_phase1.sh first.\n' >&2; exit 1; }
[[ -d apps/student/node_modules ]] || { printf 'Run scripts/install_phase1.sh first.\n' >&2; exit 1; }
pg_bin=/usr/lib/postgresql/17/bin
[[ -x "$pg_bin/initdb" ]] || { printf 'Install PostgreSQL 17 inside Ubuntu.\n' >&2; exit 1; }
demo_root="$repo_root/.tools/demo"
mkdir -p "$demo_root/socket"
chmod 700 "$demo_root" "$demo_root/socket"
if [[ ! -f "$demo_root/postgres/PG_VERSION" ]]; then
  "$pg_bin/initdb" -D "$demo_root/postgres" -U postgres --auth-local=trust --auth-host=reject --encoding=UTF8 > "$demo_root/initdb.log"
fi
if ! "$pg_bin/pg_ctl" -D "$demo_root/postgres" status > /dev/null 2>&1; then
  "$pg_bin/pg_ctl" -D "$demo_root/postgres" -l "$demo_root/postgres.log" -o "-k $demo_root/socket -p 55434 -c listen_addresses=''" -w start
fi
export PGHOST="$demo_root/socket" PGPORT=55434 PGUSER=postgres
if [[ $("$pg_bin/psql" -X -At -d postgres -c "SELECT 1 FROM pg_database WHERE datname = 'hostelxpress_demo'") != 1 ]]; then
  "$pg_bin/createdb" hostelxpress_demo
fi
export PGDATABASE=hostelxpress_demo
if [[ $("$pg_bin/psql" -X -At -c "SELECT to_regclass('public.users') IS NOT NULL") == f ]]; then
  "$pg_bin/psql" -X -v ON_ERROR_STOP=1 -f supabase/tests/bootstrap_local_auth.sql > "$demo_root/schema-init.log"
  "$pg_bin/psql" -X -v ON_ERROR_STOP=1 -f supabase/init.sql >> "$demo_root/schema-init.log"
fi
for migration in supabase/migrations/[0-9]*.sql; do
  migration_version=$(basename "$migration" .sql)
  [[ $migration_version =~ ^[0-9]{4}_[a-z0-9_]+$ ]] || { printf 'Invalid migration filename.\n' >&2; exit 1; }
  if [[ $("$pg_bin/psql" -X -At -c "SELECT to_regclass('hostelxpress_private.schema_migrations') IS NOT NULL") == f ]]; then
    "$pg_bin/psql" -X -v ON_ERROR_STOP=1 -f "$migration" >> "$demo_root/migration.log"
  elif [[ $("$pg_bin/psql" -X -At -c "SELECT count(*) FROM hostelxpress_private.schema_migrations WHERE version = '$migration_version'") == 0 ]]; then
    "$pg_bin/psql" -X -v ON_ERROR_STOP=1 -f "$migration" >> "$demo_root/migration.log"
  fi
done
if [[ ! -f "$demo_root/session.key" ]]; then
  python -c 'import secrets; print(secrets.token_urlsafe(48))' > "$demo_root/session.key"
fi
chmod 600 "$demo_root/session.key"
export HOSTELXPRESS_DEMO_ROOT="$demo_root"
export APP_ENV=demo
export DATABASE_URL="host=$PGHOST port=$PGPORT dbname=$PGDATABASE user=$PGUSER"
export DEMO_JWT_SECRET
DEMO_JWT_SECRET=$(cat "$demo_root/session.key")
export CORS_ORIGINS=http://localhost:8081,http://127.0.0.1:8081
export PYTHONPATH="$repo_root/services/api"
export EXPO_PUBLIC_API_URL=http://localhost:8000
export EXPO_NO_TELEMETRY=1 CI=1
if ! curl --fail --silent http://127.0.0.1:8000/health > /dev/null; then
  nohup setsid python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --no-proxy-headers > "$demo_root/api.log" 2>&1 < /dev/null &
  printf '%s\n' "$!" > "$demo_root/api.pid"
fi
for _ in {1..60}; do
  if curl --fail --silent http://127.0.0.1:8000/health > /dev/null; then break; fi
  sleep 1
done
curl --fail --silent http://127.0.0.1:8000/health > /dev/null || { tail -n 30 "$demo_root/api.log"; exit 1; }
if ! curl --fail --silent http://127.0.0.1:8081/ > /dev/null; then
  (
    cd apps/student
    nohup setsid npm run web -- --host localhost --port 8081 > "$demo_root/student.log" 2>&1 < /dev/null &
    printf '%s\n' "$!" > "$demo_root/student.pid"
  )
fi
for _ in {1..60}; do
  if curl --fail --silent http://127.0.0.1:8081/ > /dev/null; then break; fi
  sleep 1
done
curl --fail --silent http://127.0.0.1:8081/ > /dev/null || { tail -n 40 "$demo_root/student.log"; exit 1; }
printf '\nAPI: http://localhost:8000/docs\nStudent app: http://localhost:8081\n'
printf 'Logs: %s\nLocal simulation: cannot charge money or operate hardware.\n' "$demo_root"
