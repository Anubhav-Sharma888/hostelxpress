#!/usr/bin/env bash
set -Eeuo pipefail
[[ $(uname -s) == Linux ]] || { printf 'Run inside Ubuntu Linux.\n' >&2; exit 1; }
repo_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
cd -- "$repo_root"
[[ -f .tools/env.sh ]] || { printf 'Run Phase 0 setup first.\n' >&2; exit 1; }
# shellcheck disable=SC1091
source .tools/env.sh
python -m pip install -r services/api/requirements-dev.txt
python -m pip install -e integrations/device_connector
npm --prefix apps/student ci
printf '\nDependencies installed. Run: bash scripts/run_demo.sh\n'
