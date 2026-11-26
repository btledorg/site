#!/usr/bin/env python3
"""
update_wall.py  -  patches freedomwall.html (The ARTcher)

Usage:
    python update_wall.py freedomwall.html

Adds:
  1. More > Options toggles (saved in LS_OPTIONS):
       - Weather sky effects  (#weather-canvas + topbar weather pill)
       - Haptic feedback      (navigator.vibrate)
       - Show wall minimap    (#minimap)
       - Auto-upload drawings (overrides AUTO_UPLOAD at runtime)
       - Reset all settings
  2. Live drawing file-size badge (KB / MB) in the Post pane, with
     amber (> 500 KB) and red (> 1.5 MB) warning states, and the size
     shown in the upload / offline-save toasts.

Safe to re-run: it refuses to patch a file that already has the markers,
and it writes a .bak copy before touching anything.
"""
import re
import shutil
import sys

MARKER = "ARTCHER-V3-OPTIONS"


def die(msg):
    print("ERROR: " + msg)
    sys.exit(1)


def sub_once(src, old, new, label):
    n = src.count(old)
    if n != 1:
        die("anchor '%s' expected once, found %d" % (label, n))
    return src.replace(old, new)


def sub_all(src, old, new, label):
    n = src.count(old)
    if n < 1:
        die("anchor '%s' not found" % label)
    print("  - %s (%d place%s)" % (label, n, "" if n == 1 else "s"))
    return src.replace(old, new)


def re_once(src, pattern, repl_fn, label):
    out, n = re.subn(pattern, repl_fn, src, count=1, flags=re.S)
    if n != 1:
        die("pattern '%s' not found" % label)
    return out


# ---------------------------------------------------------------------------
# CSS
# ---------------------------------------------------------------------------
CSS = r"""
<style id="artcher-v3">
    /* ===== V3 / drawing size badge ===== */
    .size-row {
        display: flex; align-items: center; justify-content: space-between; gap: 10px;
        padding: 8px 12px; border: 1px solid var(--border); border-radius: 12px;
        background: var(--soft); font-size: 12px; font-weight: 700; color: var(--ink);
    }
    .size-label small { display: block; margin-top: 1px; font-size: 10.5px; font-weight: 500; color: var(--muted); }
    .size-badge {
        flex-shrink: 0; padding: 4px 11px; border-radius: 999px;
        font-family: 'JetBrains Mono', monospace; font-size: 12px; font-weight: 700;
        background: #fff; border: 1px solid var(--border); color: var(--ink);
        transition: background .2s, border-color .2s, color .2s;
    }
    .size-badge.warn   { background: #fffbeb; border-color: #fcd34d; color: #92400e; }
    .size-badge.danger { background: #fef2f2; border-color: #fecaca; color: var(--d-red); }
</style>
"""

# ---------------------------------------------------------------------------
# HTML
# ---------------------------------------------------------------------------
OPTION_ROWS = r"""
                                <label class="list-row">
                                    <span>Weather sky effects<small>Rain, clouds, lightning &amp; the sky pill</small></span>
                                    <span class="switch"><input type="checkbox" id="opt-weather" checked onchange="applyOptions()"></span>
                                </label>
                                <label class="list-row">
                                    <span>Haptic feedback<small>Vibrate on taps and actions</small></span>
                                    <span class="switch"><input type="checkbox" id="opt-haptic" checked onchange="applyOptions()"></span>
                                </label>
                                <label class="list-row">
                                    <span>Show wall minimap<small>Small overview map on the Wall</small></span>
                                    <span class="switch"><input type="checkbox" id="opt-minimap" checked onchange="applyOptions()"></span>
                                </label>
                                <label class="list-row">
                                    <span>Auto-upload drawings<small>Off = save on this device, upload manually</small></span>
                                    <span class="switch"><input type="checkbox" id="opt-autoupload" checked onchange="applyOptions()"></span>
                                </label>
                                <button type="button" class="list-row" onclick="resetAllSettings()">
                                    <span class="lead">
                                        <svg viewBox="0 0 24 24"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>
                                        <span style="color:var(--d-red);">Reset all settings<small>Restore Options &amp; seasonal theme defaults</small></span>
                                    </span>
                                </button>"""

SIZE_ROW = r"""<div class="size-row" id="drawing-size-row">
                                        <span class="size-label">Upload size<small id="drawing-size-hint">Estimated upload size</small></span>
                                        <span class="size-badge" id="drawing-size-badge" aria-live="polite">0.0 KB</span>
                                    </div>
                                    """

# ---------------------------------------------------------------------------
# JS (inserted right after the storage-key constants, so every later
# function can see these globals)
# ---------------------------------------------------------------------------
JS_CORE = r"""

                        /* ===== ARTCHER-V3-OPTIONS: settings toggles + drawing size (added by update_wall.py) ===== */
                        let optWeatherOn = true;
                        let optHapticOn = true;
                        let optMinimapOn = true;
                        let optAutoUpload = AUTO_UPLOAD;
                        let optionsInitDone = false;

                        const SIZE_WARN_BYTES = 500 * 1024;
                        const SIZE_DANGER_BYTES = 1.5 * 1024 * 1024;
                        let drawingSizeTimer = 0;
                        let lastDrawingBytes = 0;

                        function readOpt(id, fallback) {
                            const el = document.getElementById(id);
                            return el ? el.checked : fallback;
                        }

                        function formatBytes(bytes) {
                            const b = Math.max(0, Number(bytes) || 0);
                            if (b >= 1024 * 1024) return (b / (1024 * 1024)).toFixed(2) + " MB";
                            return (b / 1024).toFixed(1) + " KB";
                        }

                        function utf8Bytes(str) {
                            return new TextEncoder().encode(str).length;
                        }

                        // Same JSON body that uploadPending() POSTs to Apps Script
                        function entryPayloadBytes(entry) {
                            return utf8Bytes(JSON.stringify({
                                action: "addFreedomWall",
                                id: entry.id,
                                author: entry.author,
                                gx: entry.gx,
                                gy: entry.gy,
                                strokes: entry.strokes,
                                timestamp: entry.timestamp
                            }));
                        }

                        // What "Post to wall" would upload right now (strokes + text + paper tint).
                        // The local trace/reference image is never uploaded, so it is not counted.
                        function measureDrawingBytes() {
                            const items = getAllItems();
                            if (!items.length) return 0;
                            return entryPayloadBytes({
                                id: "fw_0000000000000_0000",
                                author: currentAuthorName() || "Anonymous",
                                gx: 0, gy: 0,
                                strokes: items,
                                timestamp: Date.now()
                            });
                        }

                        function updateDrawingSize() {
                            clearTimeout(drawingSizeTimer);
                            drawingSizeTimer = setTimeout(() => {
                                let bytes = 0;
                                try { bytes = measureDrawingBytes(); } catch (e) {}
                                lastDrawingBytes = bytes;
                                const badge = document.getElementById("drawing-size-badge");
                                const hint = document.getElementById("drawing-size-hint");
                                if (!badge) return;
                                badge.textContent = formatBytes(bytes);
                                badge.classList.toggle("warn", bytes > SIZE_WARN_BYTES && bytes <= SIZE_DANGER_BYTES);
                                badge.classList.toggle("danger", bytes > SIZE_DANGER_BYTES);
                                if (hint) {
                                    hint.textContent = bytes > SIZE_DANGER_BYTES
                                        ? "Very large - may be slow or fail on weak internet"
                                        : bytes > SIZE_WARN_BYTES
                                            ? "Getting large - consider simplifying"
                                            : "Estimated upload size";
                                }
                            }, 120);
                        }

                        function applyOptionVisibility() {
                            const wc = document.getElementById("weather-canvas");
                            if (wc) wc.style.display = optWeatherOn ? "" : "none";
                            const wp = document.getElementById("weather-pill");
                            if (wp) wp.hidden = !optWeatherOn;
                            const mmEl = document.getElementById("minimap");
                            if (mmEl) mmEl.hidden = !optMinimapOn;
                            try {
                                rebuildWeatherParticles();
                                updateWeatherPillUI();
                                startSeasonalParticles();
                            } catch (e) {}
                            if (optMinimapOn) { try { updateMinimap(); } catch (e) {} }
                        }

                        function resetAllSettings(confirmed = false) {
                            if (!confirmed) {
                                confirmCriticalAction(
                                    "Reset all settings?",
                                    "Every toggle in Options and the seasonal theme go back to their defaults. Your drawings, name and saved colors are kept.",
                                    () => resetAllSettings(true)
                                );
                                return;
                            }
                            lsSet(LS_OPTIONS, {
                                grid: false, smooth: true, borders: false,
                                weather: true, haptic: true, minimap: true, autoUpload: true
                            });
                            lsSet(LS_SEASON_OVERRIDE, "auto");
                            lsSet(LS_SEASON_FX, true);
                            loadOptions();
                            applySeasonalTheme();
                            haptic(10);
                            showToast("Settings reset to defaults");
                        }
"""


def main():
    if len(sys.argv) != 2:
        die("usage: python update_wall.py freedomwall.html")
    path = sys.argv[1]

    with open(path, "r", encoding="utf-8", newline="") as f:
        html = f.read()

    if MARKER in html or "artcher-v3" in html:
        die("this file already looks patched (marker found). Nothing changed.")

    print("Patching %s ..." % path)
    shutil.copyfile(path, path + ".bak")
    print("  backup -> %s.bak" % path)

    # ---- CSS -------------------------------------------------------------
    html = sub_once(html, "</head>", CSS + "</head>", "</head>")

    # ---- Options card: new toggles + reset button ------------------------
    html = re_once(
        html,
        r'(id="opt-borders"[^>]*>\s*</span>\s*</label>)',
        lambda m: m.group(1) + OPTION_ROWS,
        "Options card (opt-borders row)",
    )

    # ---- Size badge above the Post button --------------------------------
    post_btn = '<button class="btn btn-accent btn-lg btn-block" id="submit-btn" onclick="submitToWall()">Post to wall</button>'
    html = sub_once(html, post_btn, SIZE_ROW + post_btn, "Post to wall button")

    # ---- Haptics (haptic() is defined twice in the file) -----------------
    html = sub_all(
        html,
        "try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {}",
        "try { if (optHapticOn && navigator.vibrate) navigator.vibrate(ms); } catch (e) {}",
        "haptic() respects the toggle",
    )

    # ---- Auto-upload: AUTO_UPLOAD && ...  ->  optAutoUpload && ... -------
    html = sub_all(html, "AUTO_UPLOAD &&", "optAutoUpload &&", "auto-upload checks use the toggle")

    html = sub_once(
        html,
        'showToast("Saved offline ✓ Will upload when internet is good.");',
        'showToast(optAutoUpload ? `Saved offline ✓ (${sizeLabel}) Will upload when internet is good.` : `Saved on this device ✓ (${sizeLabel}) Tap Upload when you are ready.`);',
        "offline-saved toast",
    )
    html = sub_once(
        html,
        'showToast("Uploading to the wall...");',
        'showToast(sizeBytes > SIZE_DANGER_BYTES ? `Uploading large drawing (${sizeLabel}) - this may take a moment...` : `Uploading drawing (${sizeLabel})...`);',
        "uploading toast",
    )
    html = sub_once(
        html,
        "pending.push(entry);",
        "pending.push(entry);\n                            const sizeBytes = entryPayloadBytes(entry);\n                            const sizeLabel = formatBytes(sizeBytes);",
        "pending.push(entry)",
    )

    # ---- applyOptions(): read + apply + persist new toggles --------------
    html = sub_once(
        html,
        'const showBorders = document.getElementById("opt-borders").checked;',
        'const showBorders = document.getElementById("opt-borders").checked;\n'
        '                            const wasAutoUpload = optAutoUpload;\n'
        '                            optWeatherOn = readOpt("opt-weather", true);\n'
        '                            optHapticOn = readOpt("opt-haptic", true);\n'
        '                            optMinimapOn = readOpt("opt-minimap", true);\n'
        '                            optAutoUpload = readOpt("opt-autoupload", AUTO_UPLOAD);\n'
        '                            applyOptionVisibility();\n'
        '                            if (optionsInitDone && !wasAutoUpload && optAutoUpload && pending.length > 0 && navigator.onLine) uploadPending(true);',
        "applyOptions() read",
    )
    html = sub_once(
        html,
        "borders: showBorders\n",
        "borders: showBorders,\n"
        "                                weather: optWeatherOn,\n"
        "                                haptic: optHapticOn,\n"
        "                                minimap: optMinimapOn,\n"
        "                                autoUpload: optAutoUpload\n",
        "applyOptions() save",
    ) if html.count("borders: showBorders\n") == 1 else sub_once(
        html,
        "borders: showBorders\r\n",
        "borders: showBorders,\r\n"
        "                                weather: optWeatherOn,\r\n"
        "                                haptic: optHapticOn,\r\n"
        "                                minimap: optMinimapOn,\r\n"
        "                                autoUpload: optAutoUpload\r\n",
        "applyOptions() save (CRLF)",
    )

    # ---- loadOptions(): defaults + restore -------------------------------
    html = sub_once(
        html,
        "const saved = lsGet(LS_OPTIONS, { grid: false, smooth: true, borders: false });",
        "const saved = lsGet(LS_OPTIONS, { grid: false, smooth: true, borders: false, weather: true, haptic: true, minimap: true, autoUpload: true });",
        "loadOptions() defaults",
    )
    html = sub_once(
        html,
        'document.getElementById("opt-borders").checked = Boolean(saved.borders);',
        'document.getElementById("opt-borders").checked = Boolean(saved.borders);\n'
        '                            document.getElementById("opt-weather").checked = saved.weather !== false;\n'
        '                            document.getElementById("opt-haptic").checked = saved.haptic !== false;\n'
        '                            document.getElementById("opt-minimap").checked = saved.minimap !== false;\n'
        '                            document.getElementById("opt-autoupload").checked = saved.autoUpload !== false;',
        "loadOptions() restore",
    )

    # ---- weather + minimap gates -----------------------------------------
    html = sub_once(
        html,
        "function getActiveWeatherMode() {",
        'function getActiveWeatherMode() {\n                            if (!optWeatherOn) return "clear";',
        "getActiveWeatherMode()",
    )
    html = sub_once(
        html,
        "function updateMinimap() {",
        "function updateMinimap() {\n                            if (!optMinimapOn) return;",
        "updateMinimap()",
    )

    # ---- init: mark options as ready; size after draft load --------------
    html = sub_once(
        html,
        "loadOptions();",
        "loadOptions();\n                        optionsInitDone = true;",
        "init loadOptions()",
    )
    html = sub_once(
        html,
        "loadDraft();",
        "loadDraft();\n                        updateDrawingSize();",
        "init loadDraft()",
    )

    # ---- live size hooks --------------------------------------------------
    # scheduleDraftSave() already runs after every stroke end, undo, redo,
    # fill, shape, text edit/move/delete and paper change, so hooking it
    # covers all of them.
    html = sub_once(
        html,
        "function scheduleDraftSave() {",
        "function scheduleDraftSave() {\n                            updateDrawingSize();",
        "scheduleDraftSave()",
    )
    html = sub_once(
        html,
        "lsSet(LS_DRAFT, null);",
        "lsSet(LS_DRAFT, null);\n                            updateDrawingSize();",
        "clearCanvas()",
    )
    html = sub_once(
        html,
        'showToast("Reference image loaded (local only)");',
        'showToast("Reference image loaded (local only)");\n                                updateDrawingSize();',
        "trace image loaded",
    )
    html = sub_once(
        html,
        'showToast("Reference image removed");',
        'showToast("Reference image removed");\n                            updateDrawingSize();',
        "trace image removed",
    )

    # ---- core JS block (last, so it can't create duplicate anchors) ------
    html = sub_once(
        html,
        'const LS_DRAFT = "fw_draft_v1";',
        'const LS_DRAFT = "fw_draft_v1";' + JS_CORE,
        "LS_DRAFT constant",
    )

    with open(path, "w", encoding="utf-8", newline="") as f:
        f.write(html)

    print("Done. Open the page and check: More > Options (5 new rows) and Draw > Post (size badge).")


if __name__ == "__main__":
    main()