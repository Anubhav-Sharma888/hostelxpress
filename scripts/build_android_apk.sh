#!/usr/bin/env bash
# Local Android QA build. See docs/android-build.md for prerequisites/signing.
set -Eeuo pipefail
umask 077

usage() {
  printf 'Usage: bash scripts/build_android_apk.sh [debug|release] [--local-qa] [--app-dir <dir>] [--prep-only]\n'
}
VARIANT=debug
APP_DIR=apps/student
PREP_ONLY=0
LOCAL_QA=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    debug|release) VARIANT=$1; shift;;
    --app-dir)
      [[ $# -ge 2 && -n $2 && $2 != --* ]] || { printf '%s\n' '--app-dir requires a directory value.' >&2; exit 2; }
      APP_DIR=$2; shift 2;;
    --local-qa) LOCAL_QA=1; shift;;
    --prep-only) PREP_ONLY=1; shift;;
    -h|--help) usage; exit 0;;
    *) printf 'Unknown argument: %s\n' "$1" >&2; usage >&2; exit 2;;
  esac
done

REPO_ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
cd -- "$REPO_ROOT"
[[ $(uname -s) == Linux ]] || { printf 'Run inside Ubuntu Linux.\n' >&2; exit 1; }
[[ $EUID -ne 0 ]] || { printf 'Run as your normal Linux user.\n' >&2; exit 1; }
case "$REPO_ROOT" in /mnt/[a-z]/*) printf 'Use the Linux checkout, not a Windows mount.\n' >&2; exit 1;; esac
case "$APP_DIR" in /*) APP_ROOT=$APP_DIR;; *) APP_ROOT="$REPO_ROOT/$APP_DIR";; esac
[[ -f "$APP_ROOT/package-lock.json" && -f "$APP_ROOT/app.json" ]] || { printf 'App directory needs package-lock.json and app.json.\n' >&2; exit 2; }
APP_ROOT=$(cd -- "$APP_ROOT" && pwd -P)
for tool in node npm curl python3 tar; do
  tool_path=$(command -v "$tool" || true)
  [[ -n $tool_path && $tool_path != /mnt/* && $tool_path != *.exe ]] || {
    printf 'Linux %s is required; run project setup and source .tools/env.sh.\n' "$tool" >&2; exit 1;
  }
done
if [[ ! -x "$APP_ROOT/node_modules/.bin/expo" ]]; then
  (cd "$APP_ROOT" && npm ci)
fi

# Match Expo's dotenv parsing (quotes/expansion included); export only known
# publishable app settings, never source/evaluate .env as shell code.
export NODE_ENV=development
[[ $VARIANT != release ]] || export NODE_ENV=production
export HX_ANDROID_LOCAL_QA=$LOCAL_QA
PUBLIC_ENV=$(cd "$APP_ROOT" && node <<'JS'
require('@expo/env').loadProjectEnv(process.cwd(), {silent: true});
require('./plugins/withAndroidNetwork.cjs').validateBuildUrl(
  process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000', process.env.HX_ANDROID_LOCAL_QA === '1');
for (const key of ['EXPO_PUBLIC_API_URL', 'EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY']) {
  if (process.env[key] !== undefined) {
    if (/[\r\n]/.test(process.env[key])) throw new Error('Public app configuration must be single-line.');
    process.stdout.write(`${key}=${process.env[key]}\n`);
  }
}
JS
)
while IFS='=' read -r key value; do
  if [[ -n $key ]]; then export "$key=$value"; fi
done <<< "$PUBLIC_ENV"

TOOL_ROOT="$REPO_ROOT/.tools"
JDK_DIR="$TOOL_ROOT/jdk"
ANDROID_HOME="$TOOL_ROOT/android"
DL_DIR="$TOOL_ROOT/android-dl"
mkdir -p "$DL_DIR"
if [[ ! -x "$JDK_DIR/bin/java" ]]; then
  printf 'Fetching Temurin JDK 17.0.21+9...\n'
  curl -fsSL -o "$DL_DIR/jdk.tar.gz" 'https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.21%2B9/OpenJDK17U-jdk_x64_linux_hotspot_17.0.21_9.tar.gz'
  mkdir -p "$JDK_DIR"
  tar -xzf "$DL_DIR/jdk.tar.gz" -C "$JDK_DIR" --strip-components=1
fi
if [[ ! -x "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" ]]; then
  printf 'Fetching Android cmdline-tools...\n'
  curl -fsSL -o "$DL_DIR/cmdline-tools.zip" 'https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip'
  mkdir -p "$ANDROID_HOME/cmdline-tools"
  python3 - "$DL_DIR/cmdline-tools.zip" "$ANDROID_HOME/cmdline-tools" <<'PY'
import sys, zipfile
with zipfile.ZipFile(sys.argv[1]) as archive:
    archive.extractall(sys.argv[2])
PY
  mv -- "$ANDROID_HOME/cmdline-tools/cmdline-tools" "$ANDROID_HOME/cmdline-tools/latest"
  chmod -R +x "$ANDROID_HOME/cmdline-tools/latest/bin"
fi
export JAVA_HOME="$JDK_DIR" ANDROID_HOME
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"
SDKMANAGER="$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager"
license_help() {
  printf 'SDK licenses need your review. Run interactively, then rerun this build:\n  JAVA_HOME=%q %q --licenses\n' "$JAVA_HOME" "$SDKMANAGER" >&2
}
[[ -f "$ANDROID_HOME/licenses/android-sdk-license" ]] || { license_help; exit 1; }
# EOF refuses new licenses; this script never pipes acceptance to sdkmanager.
sdk_missing=0
for sdk_path in platform-tools/adb platforms/android-36/android.jar platforms/android-37.0/android.jar build-tools/36.0.0/apksigner; do
  [[ -f "$ANDROID_HOME/$sdk_path" ]] || sdk_missing=1
done
if [[ $sdk_missing -eq 1 ]]; then
  "$SDKMANAGER" 'platform-tools' 'platforms;android-36' 'platforms;android-37.0' 'build-tools;36.0.0' </dev/null || { license_help; exit 1; }
fi
for sdk_path in platform-tools/adb platforms/android-36/android.jar platforms/android-37.0/android.jar build-tools/36.0.0/apksigner; do
  [[ -f "$ANDROID_HOME/$sdk_path" ]] || { license_help; exit 1; }
done

# Always apply tracked config/plugins; a previous QA build must not leave an
# exception in a subsequent production build. No --clean or recursive deletion.
(cd "$APP_ROOT" && ./node_modules/.bin/expo prebuild -p android --no-install)
if ! grep -q '^systemProp.https.protocols=TLSv1.2$' "$APP_ROOT/android/gradle.properties"; then
  cat >> "$APP_ROOT/android/gradle.properties" <<'PIN'

# Project-local workaround for Maven TLS 1.3 handshake failures on this WSL path.
systemProp.https.protocols=TLSv1.2
PIN
fi
if [[ $PREP_ONLY -eq 1 ]]; then
  printf 'PREP_OK variant=%s local_qa=%s app_dir=%s\n' "$VARIANT" "$LOCAL_QA" "$APP_ROOT"
  exit 0
fi
TASK="assemble${VARIANT^}"
(cd "$APP_ROOT/android" && ./gradlew "$TASK" --no-daemon -q </dev/null)
APK="$APP_ROOT/android/app/build/outputs/apk/$VARIANT/app-$VARIANT.apk"
[[ -f "$APK" ]] || { printf 'Build finished but no APK at %s\n' "$APK" >&2; exit 1; }
printf '\nAPK: %s\nvariant: %s; local_qa: %s\n' "$APK" "$VARIANT" "$LOCAL_QA"
stat -c 'size: %s bytes' "$APK"
sha256sum "$APK"
"$ANDROID_HOME/build-tools/36.0.0/apksigner" verify --print-certs "$APK"
python3 - "$APK" "$VARIANT" <<'CHECK'
import sys, zipfile
apk, variant = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(apk) as archive:
    bundle = [n for n in archive.namelist() if n == 'assets/index.android.bundle']
if variant == 'release':
    assert bundle, 'release APK must contain assets/index.android.bundle'
print('bundled JS entries: ' + (', '.join(bundle) if bundle else 'none (Metro required)'))
CHECK
