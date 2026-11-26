#!/usr/bin/env python3
"""
update_wall.py - patches freedomwall.html (THE ARTcher) in place.

Usage:
    python update_wall.py freedomwall.html
    python update_wall.py freedomwall.html --dry-run     # report only
    python update_wall.py freedomwall.html --no-backup   # skip the .bak copy
    python update_wall.py freedomwall.html --revert      # restore the .bak original

This version keeps YOUR original look (doodles, dotted background, colors, Inter,
pill shapes, season themes). It only fixes layout:

  1. Top bar:  brand | radio | weather | online. Radio is a single small icon chip
     that appears while playing; tap it for a popover with name, prev, next, stop.
     Nothing floats over the page. Weather / online chips get shorter text.
  2. Landscape (laptop, tablet, phone sideways):
        left nav rail | vertical tools | big square canvas | controls panel
  3. Softer cloudy-weather overlay.

If you already ran the earlier restyle version, running this removes that
restyle block automatically and keeps the layout fixes.
"""
import argparse
import re
import shutil
import sys
from pathlib import Path

STYLE_ID = "artcher-layout"
LEGACY_STYLE_IDS = ["artcher-ui-v2"]

# --------------------------------------------------------------------------
# Layout-only CSS. No changes to colors, fonts, radii, backgrounds or doodles.
# --------------------------------------------------------------------------
CSS = r'''
:root { --side: 0px; }
.view { left: var(--side); }

/* ===== TOP BAR: brand | weather | online ===== */
.topbar > div { flex-shrink: 0; }
.brand { flex: 1 1 auto; min-width: 0; }
.brand-stack { min-width: 0; overflow: hidden; }
.brand-text { overflow: hidden; text-overflow: ellipsis; }
.brand-greeting { max-width: 220px; }
/* holiday message now lives in the header greeting, not as a pill on Home */
.season-banner { display: none !important; }
@media (max-width: 560px) { #nav-upload-btn { display: none; } }

/* ===== RADIO: one small chip in the header, details open in a popover ===== */
.radio-chip {
    height: 26px; width: 34px; padding: 0; border: 0; border-radius: 999px;
    background: var(--ink); cursor: pointer;
    display: inline-flex; align-items: center; justify-content: center;
}
.radio-chip:active { transform: scale(.94); }
.mp-eq { display: flex; align-items: flex-end; gap: 2px; width: 14px; height: 13px; }
.mp-eq i { flex: 1; height: 30%; background: #fff; border-radius: 1px; animation: mpEq 1s ease-in-out infinite; }
.mp-eq i:nth-child(2) { animation-delay: .2s; }
.mp-eq i:nth-child(3) { animation-delay: .4s; }
@keyframes mpEq { 0%, 100% { height: 25%; } 50% { height: 100%; } }
.radio-pop {
    position: absolute; top: 100%; right: 8px; margin-top: 8px; z-index: 130;
    width: min(300px, calc(100vw - 16px));
    padding: 10px 8px 10px 16px;
    display: flex; align-items: center; gap: 4px;
    background: var(--ink); color: #fff;
    border-radius: 16px; box-shadow: 0 12px 32px rgba(15, 23, 42, .28);
}
.mp-text { flex: 1; min-width: 0; display: flex; flex-direction: column; line-height: 1.3; }
.mp-text strong { font-size: 13px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mp-text small { font-size: 11px; color: #94a3b8; }
.mp-btn {
    width: 38px; height: 38px; border: 0; border-radius: 50%;
    background: transparent; color: #fff; cursor: pointer; flex-shrink: 0;
    display: inline-flex; align-items: center; justify-content: center;
}
.mp-btn:hover { background: rgba(255, 255, 255, .14); }
.mp-btn:active { background: rgba(255, 255, 255, .26); }
.mp-btn svg { width: 19px; height: 19px; stroke: currentColor; fill: none; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
@media (prefers-reduced-motion: reduce) { .mp-eq i { animation: none; height: 60%; } }

/* ===== LANDSCAPE: laptop, tablet, phone sideways ===== */
@media (orientation: landscape) and (min-width: 640px) {
    :root { --nav: 0px; --side: 72px; }

    /* bottom nav becomes a left rail */
    .bottom-nav {
        top: var(--top); bottom: 0; left: 0; right: auto;
        width: var(--side); height: auto;
        display: flex; flex-direction: column; align-items: stretch;
        padding: 8px 4px calc(8px + var(--safe-b));
        border-top: 0; border-right: 1px solid var(--border);
        overflow-y: auto;
    }
    .nav-item { flex: none; height: 62px; margin-bottom: 2px; gap: 3px; }
    .nav-badge { top: 6px; left: calc(50% + 6px); }

    /* three columns: tools | big canvas | controls */
    #view-draw {
        --panel: clamp(240px, 28vw, 340px);
        --cv: max(160px, min(
            calc(100dvh - var(--top) - var(--safe-b) - 92px),
            calc(100vw - var(--side) - 56px - var(--panel) - 76px)
        ));
        padding-left: 16px; padding-right: 16px;
    }

    .studio-wrap {
        display: grid;
        grid-template-columns: 56px var(--cv) var(--panel);
        grid-template-rows: auto auto;
        column-gap: 14px; row-gap: 10px;
        justify-content: center; align-content: center;
        width: 100%; max-width: none; margin: auto; padding: 12px 0;
    }
    .tool-dock {
        grid-column: 1; grid-row: 1 / span 2; align-self: start;
        display: flex; flex-direction: column; gap: 4px;
        width: 56px; padding: 6px;
        max-height: calc(100dvh - var(--top) - var(--safe-b) - 32px);
        overflow-y: auto; scrollbar-width: none;
    }
    .tool-dock::-webkit-scrollbar { display: none; }
    .tool-btn { width: 42px; height: 42px; flex: none; }
    .tool-btn span { display: none; }
    .tool-btn svg { width: 20px; height: 20px; }

    .studio-bar { grid-column: 2; grid-row: 1; }
    .canvas-frame { grid-column: 2; grid-row: 2; width: var(--cv); min-width: 0; margin: 0; }
    .sheet {
        grid-column: 3; grid-row: 1 / span 2; align-self: start;
        max-height: calc(100dvh - var(--top) - var(--safe-b) - 32px);
        overflow-y: auto;
    }
    .wall-fab { flex-direction: row; right: 50%; transform: translateX(50%); }
    .fab-sep { width: 1px; height: auto; margin: 6px 0; }
}
@media (orientation: landscape) and (max-height: 520px) {
    :root { --hdr: 46px; }
}
'''

RADIO_CHIP = r'''<!-- RADIO CHIP -->
                <div class="radio-chip-wrap" id="radio-mini-pill" hidden>
                    <button type="button" class="radio-chip" id="radio-chip-btn" onclick="toggleRadioPopover(event)" aria-haspopup="true" aria-expanded="false" aria-label="Now playing" title="Now playing">
                        <span class="mp-eq" aria-hidden="true"><i></i><i></i><i></i></span>
                    </button>
                    <div class="radio-pop" id="radio-pop" hidden role="dialog" aria-label="Radio player">
                        <span class="mp-text"><strong id="radio-mini-title">Radio</strong><small>Live radio</small></span>
                        <button type="button" class="mp-btn" onclick="prevRadioStation()" aria-label="Previous station" title="Previous station">
                            <svg viewBox="0 0 24 24"><polygon points="19 20 9 12 19 4 19 20" style="fill:currentColor"/><line x1="5" y1="19" x2="5" y2="5"/></svg>
                        </button>
                        <button type="button" class="mp-btn" onclick="nextRadioStation()" aria-label="Next station" title="Next station">
                            <svg viewBox="0 0 24 24"><polygon points="5 4 15 12 5 20 5 4" style="fill:currentColor"/><line x1="19" y1="5" x2="19" y2="19"/></svg>
                        </button>
                        <button type="button" class="mp-btn" onclick="closeRadioPopover(); toggleMusic()" aria-label="Stop radio" title="Stop radio">
                            <svg viewBox="0 0 24 24"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>
                        </button>
                    </div>
                </div>
                '''

RADIO_JS = r'''<script id="artcher-layout-js">
    function closeRadioPopover() {
        const p = document.getElementById("radio-pop"), b = document.getElementById("radio-chip-btn");
        if (p) p.hidden = true;
        if (b) b.setAttribute("aria-expanded", "false");
    }
    function toggleRadioPopover(e) {
        if (e) e.stopPropagation();
        const p = document.getElementById("radio-pop"), b = document.getElementById("radio-chip-btn");
        if (!p) return;
        p.hidden = !p.hidden;
        if (b) b.setAttribute("aria-expanded", String(!p.hidden));
    }
    document.addEventListener("pointerdown", (e) => {
        if (!e.target.closest("#radio-pop, #radio-chip-btn")) closeRadioPopover();
    });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeRadioPopover(); });
    </script>
    '''

LITERAL_EDITS = [
    (
        "online chip shows just the number",
        '<span id="online-count">1 online</span>',
        '<span id="online-count">1</span>',
    ),
    (
        "online chip live update",
        'if (el) el.textContent = `${count} online`;',
        'if (el) el.textContent = String(count);',
    ),
    (
        "weather chip compact text + full tooltip",
        'const tag = weatherOverride === "auto" ? `${liveWeatherState.temp}°C ${names[mode]}` : `Preview: ${names[mode]}`;',
        'const tag = weatherOverride === "auto" ? `${liveWeatherState.temp}°` : names[mode];\n'
        '                            if (el.parentElement) el.parentElement.title = `${liveWeatherState.temp}°C ${names[mode]} · Tap to preview weather effects`;',
    ),
    (
        "mini player title hides [category] prefix",
        'miniTitle.textContent = label.replace(/^Live:\\s*/i, "");',
        'miniTitle.textContent = label.replace(/^Live:\\s*/i, "").replace(/\\[[^\\]]*\\]\\s*/, "");',
    ),
    (
        "holiday greeting helper",
        'function applyProfileUI() {',
        'const SEASON_GREETINGS = { christmas: "Merry Christmas", newyear: "Happy New Year", valentines: "Happy Valentine\'s Day", halloween: "Happy Halloween", philippines: "Mabuhay" };\n'
        '                        function greetingFor(name) {\n'
        '                            const g = activeSeason ? SEASON_GREETINGS[activeSeason.id] : "";\n'
        '                            if (!g) return name ? `Hi, ${name}!` : "";\n'
        '                            return name ? `${g}, ${name}!` : `${g}!`;\n'
        '                        }\n'
        '                        function applyProfileUI() {',
    ),
    (
        "greeting (profile load)",
        'greetingEl.textContent = `Hi, ${cleanName}!`;',
        'greetingEl.textContent = greetingFor(cleanName);',
    ),
    (
        "greeting (name typed in Post tab)",
        'greetingEl.textContent = `Hi, ${trimmed}!`;',
        'greetingEl.textContent = greetingFor(trimmed);',
    ),
    (
        "refresh greeting when season changes",
        '// Refresh stencil buttons',
        'applyProfileUI();\n                            // Refresh stencil buttons',
    ),
    (
        "softer cloudy overlay",
        'alpha: 0.14 + Math.random() * 0.10',
        'alpha: 0.05 + Math.random() * 0.04',
    ),
]


def style_block_re(style_id):
    return re.compile(r'[ \t]*<style id="%s">.*?</style>[ \t]*\r?\n?' % re.escape(style_id), re.S)


def main():
    ap = argparse.ArgumentParser(description="Patch freedomwall.html (layout fixes only).")
    ap.add_argument("file", help="path to freedomwall.html")
    ap.add_argument("--dry-run", action="store_true", help="report only, do not write")
    ap.add_argument("--no-backup", action="store_true", help="do not write <file>.bak")
    ap.add_argument("--revert", action="store_true", help="restore <file>.bak and exit")
    args = ap.parse_args()

    path = Path(args.file)
    bak = path.with_suffix(path.suffix + ".bak")

    if args.revert:
        if not bak.is_file():
            sys.exit(f"No backup found: {bak}")
        shutil.copy2(bak, path)
        print(f"Restored original from {bak}")
        return

    if not path.is_file():
        sys.exit(f"File not found: {path}")

    with open(path, "r", encoding="utf-8", newline="") as f:
        text = f.read()

    nl = "\r\n" if "\r\n" in text else "\n"
    fix = lambda s: s.replace("\r\n", "\n").replace("\n", nl)

    report = []
    failed = False

    def log(label, status):
        nonlocal failed
        if status == "NOT FOUND":
            failed = True
        report.append((label, status))

    # 0. remove the earlier restyle (colors / fonts / SaaS look) if present
    for legacy in LEGACY_STYLE_IDS:
        rx = style_block_re(legacy)
        if rx.search(text):
            text = rx.sub("", text)
            log("remove earlier restyle block", "applied")

    # 1. remove the original wide radio pill from the header
    pill_re = re.compile(r'<div class="radio-top-pill" id="radio-mini-pill" hidden>.*?</div>[ \t]*\r?\n?', re.S)
    if pill_re.search(text):
        text = pill_re.sub("", text, count=1)
        log("remove wide radio pill from header", "applied")
    elif 'id="radio-mini-pill"' in text:
        log("remove wide radio pill from header", "already applied")
    else:
        log("remove wide radio pill from header", "NOT FOUND")

    # 2. remove the floating bottom player from the previous version
    legacy_re = re.compile(r'<!-- MINI PLAYER -->\s*<div class="mini-player" id="radio-mini-pill".*?</div>\s*', re.S)
    if legacy_re.search(text):
        text = legacy_re.sub("", text, count=1)
        log("remove floating bottom player", "applied")

    # 2b. radio chip in the header (popover, never covers the page)
    anchor = '<button type="button" class="weather-pill" id="weather-pill"'
    if 'class="radio-chip-wrap"' in text:
        log("add radio chip to header", "already applied")
    elif anchor in text:
        text = text.replace(anchor, fix(RADIO_CHIP) + anchor, 1)
        log("add radio chip to header", "applied")
    else:
        log("add radio chip to header", "NOT FOUND")

    # 2c. popover open/close script
    js_re = re.compile(r'[ \t]*<script id="artcher-layout-js">.*?</script>[ \t]*\r?\n?', re.S)
    had_js = bool(js_re.search(text))
    text = js_re.sub("", text)
    if "</body>" in text:
        text = text.replace("</body>", fix(RADIO_JS) + "</body>", 1)
        log("radio popover script", "updated" if had_js else "applied")
    else:
        log("radio popover script", "NOT FOUND")

    # 3. literal edits
    for label, old, new in LITERAL_EDITS:
        old, new = fix(old), fix(new)
        if new in text:
            log(label, "already applied")
        elif old in text:
            text = text.replace(old, new, 1)
            log(label, "applied")
        else:
            log(label, "NOT FOUND")

    # 3b. anonymous users still get the holiday greeting (no name)
    anon_re = re.compile(r'greetingEl\.textContent = "";\s*greetingEl\.hidden = true;')
    if anon_re.search(text):
        text = anon_re.sub('greetingEl.textContent = greetingFor("");\n                            greetingEl.hidden = !greetingEl.textContent;', text)
        log("greeting for anonymous users", "applied")
    elif 'greetingFor("")' in text:
        log("greeting for anonymous users", "already applied")
    else:
        log("greeting for anonymous users", "NOT FOUND")

    # 4. inject / refresh the layout CSS
    rx = style_block_re(STYLE_ID)
    had_block = bool(rx.search(text))
    text = rx.sub("", text)
    if "</head>" in text:
        text = text.replace("</head>", fix(f'<style id="{STYLE_ID}">{CSS}</style>\n') + "</head>", 1)
        log("inject layout stylesheet", "updated" if had_block else "applied")
    else:
        log("inject layout stylesheet", "NOT FOUND")

    width = max(len(l) for l, _ in report)
    for label, status in report:
        mark = {"applied": "+", "updated": "~", "already applied": "=", "NOT FOUND": "!"}[status]
        print(f" [{mark}] {label.ljust(width)}  {status}")

    if args.dry_run:
        print("\nDry run, nothing written.")
        return

    if not args.no_backup and not bak.exists():
        shutil.copy2(path, bak)
        print(f"\nBackup saved: {bak}")

    with open(path, "w", encoding="utf-8", newline="") as f:
        f.write(text)
    print(f"Updated: {path}")

    if failed:
        print("\nSome edits were NOT FOUND (marked [!]). The file may differ from the version this script expects.")
        sys.exit(1)


if __name__ == "__main__":
    main()