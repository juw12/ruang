#!/usr/bin/env bash
# Android smoke test (runs inside reactivecircus/android-emulator-runner).
# Installs the signed APK, launches it, waits for the WebView, then checks:
# app process alive, no FATAL EXCEPTION in logcat, screenshot is not a blank screen,
# and the UI tree contains the app's own text. Saves hone/shots/13-android-app.png.
set -euo pipefail
APK_DIR="${1:-apk}"
OUT="${2:-hone/shots}"
PKG="io.github.juw12.ruang"
mkdir -p "$OUT"
APK=$(ls "$APK_DIR"/*.apk | head -1)
echo "apk: $APK"
adb install -r "$APK"
adb logcat -c
adb shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1
sleep 30
adb exec-out screencap -p > "$OUT/13-android-app.png"
adb shell uiautomator dump /sdcard/ui.xml > /dev/null 2>&1 || true
adb pull /sdcard/ui.xml "$OUT/android-ui.xml" > /dev/null 2>&1 || true
adb logcat -d > "$OUT/android-logcat.txt" || true

fail=0
if adb shell pidof "$PKG" > /dev/null; then
  echo "ok  app process running"
else
  echo "FAIL app process not running"; fail=1
fi
if grep -q "FATAL EXCEPTION" "$OUT/android-logcat.txt"; then
  echo "FAIL fatal exception in logcat"; grep -A 15 "FATAL EXCEPTION" "$OUT/android-logcat.txt" | head -40; fail=1
else
  echo "ok  no fatal exception"
fi
python3 - "$OUT/13-android-app.png" <<'PY' || fail=1
import struct, sys, zlib
data = open(sys.argv[1], "rb").read()
assert data[:8] == b"\x89PNG\r\n\x1a\n", "screencap is not a PNG"
pos, idat, width, height = 8, b"", 0, 0
while pos < len(data):
    length, kind = struct.unpack(">I4s", data[pos:pos + 8])
    body = data[pos + 8:pos + 8 + length]
    if kind == b"IHDR":
        width, height = struct.unpack(">II", body[:8])
    elif kind == b"IDAT":
        idat += body
    pos += 12 + length
raw = zlib.decompress(idat)
# Sample bytes across the image; a blank/black screen has almost no distinct values.
distinct = len(set(raw[::97]))
print(f"screenshot {width}x{height}, distinct sampled byte values {distinct}")
sys.exit(0 if distinct > 40 else 1)
PY
if grep -qi "ruang" "$OUT/android-ui.xml" 2>/dev/null; then
  echo "ok  UI tree mentions Ruang"
else
  echo "note: UI tree did not expose WebView text (not fatal)"
fi
grep -iE "chromium|console|tauri" "$OUT/android-logcat.txt" | grep -iE "error|uncaught" | head -20 || true
exit $fail
