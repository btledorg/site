#!/usr/bin/env python3
"""
update_wall_install.py - run AFTER update_wall.py:

    python update_wall_install.py freedomwall.html

Makes the in-app update button say "Install Update" and go straight to the native
download + install flow. Old APKs that lack the native method still fall back to a
plain download, with a clear message.
"""
import pathlib
import shutil
import sys


def replace_once(src, old, new, name):
    n = src.count(old)
    if n != 1:
        sys.exit(f"[{name}] expected 1 match, found {n}. Nothing was written.")
    return src.replace(old, new, 1)


path = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "freedomwall.html")
src = path.read_text(encoding="utf-8")

src = replace_once(
    src,
    'title.textContent = has ? "Download Update" : (hasNativeUpdate() ? "Check for updates" : "Download latest APK");',
    'title.textContent = has ? "Install Update" : (hasNativeUpdate() ? "Check for updates" : "Update the app");',
    "title",
)
src = replace_once(
    src,
    'showToast("Checking for updates…");',
    'showToast("Checking… the update installs right after it downloads");',
    "native-toast",
)
src = replace_once(
    src,
    'showToast("Downloading APK…");',
    'showToast("This app version can\'t self-install. Downloading the APK, tap it when finished.");',
    "old-apk-toast",
)

shutil.copy(path, str(path) + ".bak2")
path.write_text(src, encoding="utf-8")
print(f"Patched {path}  (backup: {path}.bak2)")