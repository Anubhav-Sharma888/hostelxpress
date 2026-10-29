# Local Android APK builds (Ubuntu, free toolchain)

`scripts/build_android_apk.sh` builds debug or standalone release APKs for device QA. It uses a local SDK, a generated native project, and the Expo template's debug signing key. These are **tester artifacts**, not store releases. Downloads, npm packages, and Gradle caches require internet on first setup. No cloud build account or paid service is required. This is a repeatable source/configuration procedure, not a promise of byte-identical APKs across machines or toolchain updates.

## Prerequisites and usage

Use the canonical Linux checkout, not `/mnt/c` or the Windows review mirror. On a new machine first follow [Linux setup](linux-setup.md), then:

```bash
source .tools/env.sh
(cd apps/student && npm ci)
# Start with publishable app settings in apps/student/.env, or shell variables.
# This explicit QA option permits HTTP only to localhost, using USB reverse.
bash scripts/build_android_apk.sh release --local-qa
bash scripts/build_android_apk.sh debug --local-qa
```

The script requires Linux Node/npm, curl, Python 3, and tar. It runs `npm ci` if Expo is absent; rerun `npm ci` yourself after changing the lockfile. It invokes the installed Expo CLI directly, avoiding an implicit download of a newer Expo through `npx`.

An ordinary build requires an explicitly configured HTTPS API:

```bash
EXPO_PUBLIC_API_URL=https://<your-approved-api-host> bash scripts/build_android_apk.sh release
```

That command still produces a debug-signed tester artifact. Production signing, public hosting, and live integration approval are separate work.

Options: `--app-dir <dir>` chooses another student source directory; `--prep-only` applies the toolchain/native setup without Gradle; `--help` prints usage. Invalid arguments fail before setup starts.

## SDK license review

The script downloads a pinned Temurin JDK **17.0.21+9** and Google command-line tools archive **11076708** when absent. If SDK licenses have not been accepted, it stops and prints a command to review them interactively, for example:

```bash
JAVA_HOME="$PWD/.tools/jdk" .tools/android/cmdline-tools/latest/bin/sdkmanager --licenses
```

The human operator decides whether to accept each license. The build script never supplies `yes` or accepts new terms. Package installation and Gradle receive EOF on standard input; missing packages/licenses fail the build. Required packages are `platform-tools`, `platforms;android-36`, `platforms;android-37.0` (Expo 58's compile SDK), and `build-tools;36.0.0`; Gradle also needs its template-selected NDK. Existing installed SDK packages are reused without an SDK repository update.

## Configuration and network policy

Expo's own dotenv parser handles `.env` values, quotes, expansion, and environment precedence. The script passes only the known public API/Supabase settings to the build; never place backend, payment, MQTT, or device secrets in app settings. Public settings are embedded in the JavaScript and are readable from the APK.

The tracked plugin `apps/student/plugins/withAndroidNetwork.cjs` generates the manifest reference and network-security XML on **every** prebuild:

- Default: cleartext is denied everywhere, including an explicit localhost denial to prevent Android 17's implicit exception; the script requires an HTTPS API URL.
- `--local-qa`: cleartext remains denied by default, with one exact `localhost` exception. HTTP LAN addresses, emulator aliases, and subdomains are rejected. Use USB reverse for backend and, with debug builds, Metro. HTTPS endpoints still work.

The localhost exception supports older Android versions whose release policy otherwise rejects HTTP. Android 17 adds an implicit localhost exception, but this explicit configuration is necessary for the app's earlier supported versions. No blanket cleartext permission or custom certificate trust is enabled.

Prebuild runs without `--clean`; it regenerates ignored native configuration without deleting the project. The script then reapplies `systemProp.https.protocols=TLSv1.2` to that project's generated Gradle properties. This narrowly addresses the Maven TLS handshake failure observed on this WSL network path. It does not change application TLS settings. Remove the workaround when it is no longer needed.

## Artifact verification

The script prints path, variant, QA flag, size, SHA-256 and certificate information; release builds must contain `assets/index.android.bundle` (Hermes). Debug builds normally load JavaScript from Metro. Independent verification:

```bash
apk=apps/student/android/app/build/outputs/apk/release/app-release.apk
sha256sum "$apk"
.tools/android/build-tools/36.0.0/apksigner verify --print-certs "$apk"
.tools/android/build-tools/36.0.0/aapt2 dump xmltree --file AndroidManifest.xml "$apk"
.tools/android/build-tools/36.0.0/aapt2 dump xmltree --file res/xml/hostelxpress_network_security.xml "$apk"
```

Check that the manifest references the XML and that the XML matches the intended QA/default mode. Neither a successful build nor a structural inspection establishes actual phone behavior. See [device QA](device-qa-checklist.md).

## Isolated regeneration check

Use a unique temporary directory and exclude generated folders and local environment files. This checks prebuild/plugin regeneration with shared installed dependencies; it is **not** a fresh dependency-install test. It does not modify the real app's native project:

```bash
iso_root=$(mktemp -d /tmp/hostelxpress-android.XXXXXXXX)
mkdir "$iso_root/app"
tar -C apps/student --exclude=./android --exclude=./ios --exclude=./node_modules \
  --exclude=./.expo --exclude=./dist --exclude='./.env*' -cf - . | tar -C "$iso_root/app" -xf -
ln -s "$PWD/apps/student/node_modules" "$iso_root/app/node_modules"
EXPO_PUBLIC_API_URL=http://localhost:8000 bash scripts/build_android_apk.sh release \
  --local-qa --app-dir "$iso_root/app" --prep-only
cat "$iso_root/app/android/app/src/main/res/xml/hostelxpress_network_security.xml"
printf 'Temporary review directory: %s\n' "$iso_root"
```

For a fresh dependency check, omit the symlink and run `npm ci` in the copied app before prebuild. Keep the printed directory for inspection; no fixed path is recursively deleted by these instructions.

## Limits and sources

First Gradle builds can download several GB. Run long builds in an attached terminal and retain the build log; the earlier idle-WSL shutdown explanation was not established as a platform guarantee. Both APK variants remain debug signed. Phone install, sign-in, booking, offline recovery, and TalkBack are still unverified until recorded from a real device.

Primary references: [Expo SDK 58](https://docs.expo.dev/versions/v58.0.0/), [Expo config plugins](https://docs.expo.dev/config-plugins/plugins/), [Android network security configuration](https://developer.android.com/privacy-and-security/security-config), [SDK manager and licenses](https://developer.android.com/tools/sdkmanager), [pinned Temurin release](https://github.com/adoptium/temurin17-binaries/releases/tag/jdk-17.0.21%2B9).
