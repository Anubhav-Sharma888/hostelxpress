#!/usr/bin/env bash
# Phase 0: student app/backend development prerequisites. Run inside Ubuntu.
# No ROS, simulator, firmware, navigation, or actuator software is installed.
set -Eeuo pipefail
IFS=$'\n\t'
umask 022

fail() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
usage() {
  cat <<'USAGE'
Usage: bash scripts/setup_ubuntu_22_04.sh [--skip-apt]
Run as your normal Ubuntu 22.04 user; sudo is used only for apt packages.
--skip-apt: use prerequisites already installed by the machine administrator.
Optional: NODE_VERSION=24.22.1 (a supported Node 24 LTS patch release).
Installs a project-local Node runtime, a Python venv, and development tools.
USAGE
}
if [[ ${1:-} == '--help' ]]; then usage; exit 0; fi
skip_apt=0
if [[ ${1:-} == '--skip-apt' ]]; then skip_apt=1; shift; fi
[[ $# -eq 0 ]] || fail 'Unexpected arguments; use --help.'
[[ $(uname -s) == Linux ]] || fail 'Run inside Ubuntu Linux, not a Windows shell.'
[[ $EUID -ne 0 ]] || fail 'Run as a normal user, without sudo before bash.'
[[ -r /etc/os-release ]] || fail '/etc/os-release is unavailable.'
# shellcheck disable=SC1091
source /etc/os-release
[[ ${ID:-} == ubuntu && ${VERSION_ID:-} == 22.04 ]] || fail 'This script targets Ubuntu 22.04 only.'
case "$(dpkg --print-architecture)" in
  amd64) node_arch=x64 ;;
  arm64) node_arch=arm64 ;;
  *) fail 'Only 64-bit amd64 and arm64 Ubuntu are supported.' ;;
esac

project_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
case "$project_root" in
  /mnt/[a-z]/*) fail 'Copy/clone this repository into the Linux filesystem, for example ~/src/hostelxpress.' ;;
esac
node_version=${NODE_VERSION:-24.22.1}
[[ $node_version =~ ^24\.[0-9]+\.[0-9]+$ ]] || fail 'NODE_VERSION must be an exact Node 24 release, e.g. 24.22.1.'
apt_packages=(
  ca-certificates curl gnupg xz-utils build-essential pkg-config git
  python3.10 python3.10-venv python3.10-dev
  libpq-dev libssl-dev libffi-dev postgresql-client shellcheck
)
if [[ $skip_apt -eq 0 ]]; then
  command -v sudo >/dev/null || fail 'sudo is required; ask the machine administrator to install it.'
  sudo -v
  sudo apt-get update
  sudo apt-get install --yes --no-install-recommends "${apt_packages[@]}"
else
  for package in "${apt_packages[@]}"; do
    package_status=$(dpkg-query --show --showformat='${Status}' "$package" 2>/dev/null) ||
      fail "Missing prerequisite package: $package. Ask the administrator to install the listed apt packages."
    [[ $package_status == 'install ok installed' ]] ||
      fail "Prerequisite package is not installed: $package."
  done
fi
for tool in curl gpg gpgv tar xz sha256sum git cc pkg-config psql shellcheck; do
  command -v "$tool" >/dev/null || fail "Missing prerequisite command: $tool."
done
[[ -x /usr/bin/python3.10 ]] || fail 'Missing prerequisite: /usr/bin/python3.10.'
/usr/bin/python3.10 -m venv --help >/dev/null ||
  fail 'The Python 3.10 venv module is unavailable.'

setup_tmp=$(mktemp -d -t hostelxpress-setup.XXXXXXXX)
cleanup() { rm -rf -- "$setup_tmp"; }
trap cleanup EXIT
trap 'printf "Setup failed at line %s. Fix the reported error, then rerun.\n" "$LINENO" >&2' ERR
fetch() { curl --fail --show-error --silent --location --proto '=https' --tlsv1.2 --retry 3 "$1" --output "$2"; }

node_archive="node-v${node_version}-linux-${node_arch}.tar.xz"
node_dist="https://nodejs.org/dist/v${node_version}"
fetch "${node_dist}/${node_archive}" "${setup_tmp}/${node_archive}"
fetch "${node_dist}/SHASUMS256.txt" "${setup_tmp}/SHASUMS256.txt"
fetch "${node_dist}/SHASUMS256.txt.sig" "${setup_tmp}/SHASUMS256.txt.sig"
# Official Node release keyring, obtained over HTTPS. No downloaded shell is run.
fetch 'https://raw.githubusercontent.com/nodejs/release-keys/HEAD/gpg/pubring.kbx' "${setup_tmp}/nodejs-keyring.kbx"
mkdir -m 700 "${setup_tmp}/gnupg"
# Export KBX to a legacy public keyring: gpgv reads it without KBX lock warnings.
gpg --batch --no-tty --homedir "${setup_tmp}/gnupg" --no-default-keyring \
  --keyring "${setup_tmp}/nodejs-keyring.kbx" --export > "${setup_tmp}/nodejs-release.gpg"
[[ -s ${setup_tmp}/nodejs-release.gpg ]] || fail 'The Node release keyring contains no public keys.'
# Explicit detached verification authenticates the exact manifest read below.
gpgv --homedir "${setup_tmp}/gnupg" --keyring "${setup_tmp}/nodejs-release.gpg" \
  "${setup_tmp}/SHASUMS256.txt.sig" "${setup_tmp}/SHASUMS256.txt"
awk -v artifact="$node_archive" '$2 == artifact {print}' "${setup_tmp}/SHASUMS256.txt" > "${setup_tmp}/selected.sha256"
[[ $(wc -l < "${setup_tmp}/selected.sha256") -eq 1 ]] || fail 'The signed manifest must contain exactly one matching archive.'
(cd -- "$setup_tmp" && sha256sum --check selected.sha256)

node_parent="${project_root}/.tools/node"
node_target="${node_parent}/node-v${node_version}-linux-${node_arch}"
mkdir -p -- "$node_parent"
if [[ ! -e $node_target ]]; then
  tar --extract --xz --file "${setup_tmp}/${node_archive}" --directory "$setup_tmp" \
    --no-same-owner --no-same-permissions
  mv -- "${setup_tmp}/node-v${node_version}-linux-${node_arch}" "$node_target"
fi
[[ -x ${node_target}/bin/node ]] || fail 'Existing Node installation is incomplete; inspect .tools/node before retrying.'
[[ $("${node_target}/bin/node" --version) == "v${node_version}" ]] || fail 'Existing Node installation has an unexpected version.'
[[ ! -e ${node_parent}/current || -L ${node_parent}/current ]] || fail '.tools/node/current exists and is not a symlink.'
ln -sfn -- "node-v${node_version}-linux-${node_arch}" "${node_parent}/current"

if [[ -e ${project_root}/.venv && ! -f ${project_root}/.venv/pyvenv.cfg ]]; then
  fail '.venv already exists but is not a Python virtual environment; inspect it before retrying.'
fi
if [[ ! -e ${project_root}/.venv ]]; then
  /usr/bin/python3.10 -m venv "${project_root}/.venv"
fi
"${project_root}/.venv/bin/python" -c \
  'import sys; assert sys.version_info[:2] == (3, 10), "Existing venv must use Python 3.10"; assert sys.prefix != sys.base_prefix, "Expected an isolated venv"'

# Generate Bash activation with properly quoted paths; never alter .bashrc.
{
  printf '# Generated by setup_ubuntu_22_04.sh; source from Bash.\n'
  # Preserve the caller's PATH expansion in the generated activation script.
  # shellcheck disable=SC2016
  printf 'export PATH=%q:"$PATH"\n' "${node_parent}/current/bin"
  printf 'source %q\n' "${project_root}/.venv/bin/activate"
} > "${project_root}/.tools/env.sh"
export PATH="${node_parent}/current/bin:$PATH"
printf '\nInstalled development tools:\n'
"${project_root}/.venv/bin/python" --version
"${project_root}/.venv/bin/python" -m pip --version
node --version
npm --version
git --version
printf '\nIn each new Ubuntu Bash terminal, run:\n  source %q\n' "${project_root}/.tools/env.sh"
printf 'Application dependencies will be selected and locked in the approved implementation phase.\n'
