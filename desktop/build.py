"""Build the Ruang desktop app: copy the web app into dist/ and compile the Tauri exe.

Usage: python desktop/build.py [--offline] [--copy-only]
--copy-only: only refresh desktop/dist (used before the Tauri CLI builds the Android APK / Windows installer).
Output: desktop/target/release/ruang.exe (single file, web assets embedded, needs WebView2 = built into Windows 10/11).
"""
import shutil
import subprocess
import sys
from pathlib import Path

DESKTOP = Path(__file__).resolve().parent
ROOT = DESKTOP.parent
WEB = ["index.html", "styles.css", "manifest.webmanifest", "sw.js", "assets", "js", "vendor"]


def copy_web():
    dist = DESKTOP / "dist"
    if dist.exists():
        shutil.rmtree(dist)
    dist.mkdir()
    for name in WEB:
        source = ROOT / name
        if source.is_dir():
            shutil.copytree(source, dist / name)
        else:
            shutil.copy2(source, dist / name)
    return dist


def main():
    dist = copy_web()
    print(f"web app copied to {dist}")
    if "--copy-only" in sys.argv:
        return
    command = ["cargo", "build", "--release"]
    if "--offline" in sys.argv:
        command.append("--offline")
    sys.exit(subprocess.call(command, cwd=DESKTOP))


if __name__ == "__main__":
    main()
