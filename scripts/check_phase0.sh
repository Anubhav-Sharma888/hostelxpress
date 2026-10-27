#!/usr/bin/env bash
# Read-only file checks, followed by OPTIONAL tests against an already-initialized
# disposable database. Never bootstraps or initializes a database implicitly.
set -Eeuo pipefail
[[ $(uname -s) == Linux ]] || { printf 'Run checks in Linux.\n' >&2; exit 1; }
repo_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
cd -- "$repo_root"
command -v shellcheck >/dev/null || { printf 'Install shellcheck first.\n' >&2; exit 1; }
for script in scripts/*.sh; do
  bash -n "$script"
  shellcheck "$script"
done
python3 tests/validate_contracts.py

if [[ ${1:-} == --database ]]; then
  [[ $# -eq 1 ]] || { printf 'Usage: bash scripts/check_phase0.sh [--database]\n' >&2; exit 1; }
  [[ ${HOSTELXPRESS_TEST_DATABASE:-} == disposable ]] || {
    printf 'Set HOSTELXPRESS_TEST_DATABASE=disposable only for a disposable initialized database.\n' >&2
    exit 1
  }
  # psql uses PGHOST/PGPORT/PGUSER/PGDATABASE and .pgpass/PGPASSFILE.
  # Do not place a password-bearing connection URI in a command line or log.
  psql -X --set ON_ERROR_STOP=1 --file supabase/tests/phase0_schema.sql
elif [[ $# -ne 0 ]]; then
  printf 'Usage: bash scripts/check_phase0.sh [--database]\n' >&2
  exit 1
else
  printf 'Database tests skipped; pass --database for a disposable initialized database.\n'
fi
