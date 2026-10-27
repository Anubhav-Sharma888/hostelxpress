#!/usr/bin/env bash
set -Eeuo pipefail
[[ $(uname -s) == Linux ]] || { printf 'Run inside Ubuntu Linux.\n' >&2; exit 1; }
repo_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
demo_root="$repo_root/.tools/demo"
for service_name in api student; do
  pid_file="$demo_root/$service_name.pid"
  if [[ -f $pid_file ]]; then
    service_pid=$(cat "$pid_file")
    owns_process=false
    if [[ $service_pid =~ ^[0-9]+$ && -r /proc/$service_pid/environ ]]; then
      while IFS= read -r -d '' entry; do
        if [[ $entry == "HOSTELXPRESS_DEMO_ROOT=$demo_root" ]]; then owns_process=true; fi
      done < "/proc/$service_pid/environ"
      if [[ $owns_process == true ]]; then
        service_group=$(ps -o pgid= -p "$service_pid" | tr -d ' ')
        if [[ $service_group == "$service_pid" ]]; then
          kill -- "-$service_group" 2>/dev/null || true
        else
          kill "$service_pid" 2>/dev/null || true
        fi
      fi
    fi
    rm -f -- "$pid_file"
  fi
done
if [[ -f $demo_root/postgres/PG_VERSION ]]; then
  /usr/lib/postgresql/17/bin/pg_ctl -D "$demo_root/postgres" -m fast -w stop || true
fi
printf 'Local demo services stopped.\n'
