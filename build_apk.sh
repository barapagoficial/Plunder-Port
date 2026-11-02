#!/usr/bin/env bash
# Compila Plunder Port como APK sin Android Studio.
# Requiere (Ubuntu/Debian): apt install aapt apksigner zipalign dalvik-exchange android-sdk-platform-23 openjdk-17-jdk
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
ANDROID_JAR="${ANDROID_JAR:-/usr/lib/android-sdk/platforms/android-23/android.jar}"
B="$ROOT/build"
rm -rf "$B"; mkdir -p "$B/classes" "$B/assets/game" "$ROOT/dist"
cp -r "$ROOT/game/." "$B/assets/game/"

javac -source 8 -target 8 -nowarn -Xlint:-options -bootclasspath "$ANDROID_JAR" -d "$B/classes" \
  $(find "$ROOT/android/src" -name '*.java')
dalvik-exchange --dex --output="$B/classes.dex" "$B/classes"

aapt package -f -M "$ROOT/android/AndroidManifest.xml" -S "$ROOT/android/res" -A "$B/assets" \
  -I "$ANDROID_JAR" -F "$B/unsigned.apk"
(cd "$B" && aapt add unsigned.apk classes.dex >/dev/null)
zipalign -f 4 "$B/unsigned.apk" "$B/aligned.apk"

KS="$ROOT/android/debug.keystore"
if [ ! -f "$KS" ]; then
  keytool -genkeypair -keystore "$KS" -storepass android -keypass android -alias plunderport \
    -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Moon Studios, O=Moon Studios, C=CO" >/dev/null 2>&1
fi
apksigner sign --ks "$KS" --ks-pass pass:android --key-pass pass:android --ks-key-alias plunderport \
  --out "$ROOT/dist/PlunderPort.apk" "$B/aligned.apk"
apksigner verify -v "$ROOT/dist/PlunderPort.apk" | head -5
ls -la "$ROOT/dist/PlunderPort.apk"
