# Ubuntu development setup

Phase 0 prepares the student application, FastAPI backend, Supabase, payment integration, and the data contract between the app, backend, and hardware team. It installs no ROS 2, Gazebo, SLAM/Nav2, firmware, motor control, or physical navigation components.

## Run

Use Ubuntu 22.04 LTS, 64-bit `amd64` or `arm64`. On Windows, use an Ubuntu 22.04 WSL 2 distribution and keep the checkout in its Linux filesystem, such as `~/src/hostelxpress`. Run the commands in Ubuntu Bash, not PowerShell, Git Bash, or a Windows Node/Python installation. Do not reuse a Windows virtual environment or `node_modules` directory.

From the repository root:

```bash
bash scripts/setup_ubuntu_22_04.sh
source .tools/env.sh
python --version
node --version
npm --version
git --version
```

Run the script as a normal user. It requests sudo access for Ubuntu apt packages. The project-local Node runtime and Python virtual environment belong to that user. It does not change shell startup files, operating-system default runtimes, Git remotes, firewall rules, or cloud resources. Re-running reuses the same runtime directories and venv. Apt installs available security updates for the named packages; this is not a complete operating-system upgrade.

## Prerequisites installed by an administrator

If the machine administrator has already installed every apt package listed in the setup script, run its explicit prerequisite-only mode as your normal user:

```bash
bash scripts/setup_ubuntu_22_04.sh --skip-apt
source .tools/env.sh
```

This mode does not invoke sudo or apt. It first checks that every listed package and required command is installed, then performs the same verified Node download and isolated venv setup. Missing prerequisites cause an error before downloads. Use the default mode for a new machine where you can enter your own sudo password locally; never send that password in chat.

## Version and integrity policy

Node.js is pinned to **24.22.1**, the latest release in the supported Node 24 LTS line verified on **26 October 2026**. Node 26 is still Current on that date; its scheduled LTS transition is 28 October. To adopt a reviewed Node 24 patch later, pass an exact version, for example `NODE_VERSION=24.22.1 bash scripts/setup_ubuntu_22_04.sh`. The script verifies the detached signature of the exact SHASUMS256.txt manifest using the Node release keyring and then checks the selected archive's SHA-256 digest. The fetched KBX keyring is exported to a temporary public keyring for unambiguous gpgv verification. The keyring bootstrap trusts HTTPS access to the official Node GitHub organization. It does not execute a downloaded installer script.

Ubuntu 22.04 supplies Python 3.10. Upstream Python 3.10 reaches end of support in October 2026; use Ubuntu's maintained package updates while retaining the requested Ubuntu 22.04 environment. Ubuntu 22.04 standard security maintenance runs through May 2027. Reassess the operating-system/Python baseline before production rollout or a deployment beyond that support window; Phase 0 does not add a third-party Python package repository.

The `.venv` is isolated from system site packages. No FastAPI, payment SDK, MQTT SDK, Supabase SDK, React Native, Expo, Flutter, Android SDK, or application framework version is installed yet. Those dependencies need a compatible, tested lockfile when their implementation phase is approved. A Linux machine can develop Android applications; iOS native builds require an appropriate macOS builder or managed build service when that target is selected.

Generated `.venv/` and `.tools/` are local artifacts and must be excluded from Git. Node/npm paths are active only after sourcing `.tools/env.sh`. Moving the checkout requires recreating the venv because Python virtual environments contain absolute paths.

## Checks

```bash
bash -n scripts/setup_ubuntu_22_04.sh
shellcheck scripts/setup_ubuntu_22_04.sh
source .tools/env.sh
python -c 'import sys; assert sys.prefix != sys.base_prefix; print(sys.version)'
node -p 'process.platform + "/" + process.arch'
```

Expected: Python 3.10 from `.venv`, Node 24.22.1, and `linux/x64` or `linux/arm64`. Full installation requires a network connection and sudo access. Syntax checks alone do not establish that apt installation works on a clean machine.

## Primary sources

- [Node.js supported releases](https://nodejs.org/en/about/previous-releases)
- [Node.js release schedule](https://github.com/nodejs/Release/blob/main/schedule.json)
- [Node.js binary signature verification](https://github.com/nodejs/node/blob/main/README.md#verifying-binaries)
- [Node 24 release checksums](https://nodejs.org/download/release/latest-v24.x/SHASUMS256.txt)
- [Python virtual environments](https://docs.python.org/3.10/library/venv.html)
- [Ubuntu release lifecycle](https://ubuntu.com/about/release-cycle)
- [Develop with WSL in the Linux filesystem](https://learn.microsoft.com/en-us/windows/wsl/filesystems)
