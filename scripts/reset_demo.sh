#!/usr/bin/env bash
# Wipe the local demo database and services. Never touches Supabase, payments,
# MQTT, or hardware; the demo stack is fully local and disposable.
set -Eeuo pipefail
[[ $(uname -s) == Linux ]] || { printf 'Run inside Ubuntu Linux.\n' >&2; exit 1; }
[[ $EUID -ne 0 ]] || { printf 'Run as your normal Linux user.\n' >&2; exit 1; }
repo_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
cd -- "$repo_root"
case "$repo_root" in /mnt/[a-z]/*) printf 'Use the Linux checkout.\n' >&2; exit 1;; esac
bash scripts/stop_demo.sh
rm -rf .tools/demo/postgres .tools/demo/socket .tools/demo/session.key
rm -f .tools/demo/*.log .tools/demo/api.pid .tools/demo/student.pid
printf 'Demo state wiped. Run: bash scripts/run_demo.sh\n' >&2
