#!/usr/bin/env bash
# Opt-in local TLS proof; no cloud broker, payment gateway, or physical hardware.
set -Eeuo pipefail
[[ $(uname -s) == Linux ]] || { printf 'Run inside Ubuntu Linux.\n' >&2; exit 1; }
[[ $EUID -ne 0 ]] || { printf 'Run as your normal Linux user.\n' >&2; exit 1; }
repo_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
cd -- "$repo_root"
case "$repo_root" in /mnt/[a-z]/*) printf 'Use the Linux checkout.\n' >&2; exit 1;; esac
if [[ ${HOSTELXPRESS_MQTT_PROOF:-} != 1 ]]; then
  printf 'SKIP: set HOSTELXPRESS_MQTT_PROOF=1 for the isolated TLS transport proof.\n'
  exit 0
fi
[[ -f .tools/env.sh ]] || { printf 'Run Phase 0 setup first.\n' >&2; exit 1; }
# shellcheck disable=SC1091
source .tools/env.sh
python tests/integration/mqtt_tls_proof.py
