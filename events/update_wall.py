#!/usr/bin/env python3
"""
update_wall.py - patches freedomwall.html in place (a .bak copy is written first).

    python update_wall.py freedomwall.html

What it does
  1. Wall rendering fix (the "whites"): tiles are now rendered at 500px (same as the
     editor / popup) on a transparent layer, then scaled down and put over the paper
     colour. Leaderboard thumbnails use the same renderer.
  2. Post redesign: the size readout is removed from the draw-hud and moved into the
     Post tab as a size meter (+ a small warning dot on the Post tab). The Post pane
     is reordered: name -> size meter -> Post button -> tools row.
  3. Two-finger double-tap on the canvas = Redo (Ctrl+Y works too).
  4. Whiteboard-only fullscreen on the Wall (new button in the wall toolbar).
  5. Download link + versions are read from download/version.json:
       - APK links use apkUrl
       - appVersion is shown under "ARCHERSTUDIO @ 2026"
       - new "App updates" card inside the Android app, wired to the native updater
         (needs the small MainActivity change).

The script aborts without writing anything if any anchor is missing or ambiguous.
"""
import pathlib
import re
import shutil
import sys

MARKER = 'id="artcher-update2"'


def replace_once(src, old, new, name):
    n = src.count(old)
    if n != 1:
        sys.exit(f"[{name}] expected 1 match, found {n}. Nothing was written.")
    return src.replace(old, new, 1)


def regex_once(src, pattern, new, name):
    m = list(re.finditer(pattern, src, flags=re.S))
    if len(m) != 1:
        sys.exit(f"[{name}] expected 1 match, found {len(m)}. Nothing was written.")
    s, e = m[0].span()
    return src[:s] + new + src[e:]


# --------------------------------------------------------------------------- #
# HTML pieces
# --------------------------------------------------------------------------- #
POST_PANE = r'''<div class="sheet-pane" id="pane-post">
                                                                            <div class="post-where" id="event-post-note">Posting to the main wall</div>
                                                                            <input type="text" id="author-input" class="name-input" maxlength="24" placeholder="Your name or alias (optional)" oninput="handleStudioAuthorInput(this.value)" />
                                                                            <div class="post-meter" id="post-meter" data-state="empty">
                                                                                <div class="pm-top"><span>Post size</span><span class="pm-val" id="pm-val">0.000 MB</span></div>
                                                                                <div class="pm-track"><div class="pm-fill" id="pm-fill"></div></div>
                                                                                <div class="pm-hint" id="pm-hint">Draw something to see the size</div>
                                                                            </div>
                                                                            <button class="btn btn-accent btn-lg btn-block" id="submit-btn" onclick="submitToWall()">Post to wall</button>
                                                                            <div class="studio-stats" id="studio-stats">0 strokes · 0 on wall</div>
                                                                            <div class="post-tools">
                                                                                <button class="btn" onclick="previewDrawing()"><svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>Replay</button>
                                                                                <button class="btn" onclick="saveStudioPNG()"><svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>PNG</button>
                                                                                <button class="btn" onclick="shareStudio()"><svg viewBox="0 0 24 24"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.6" y1="13.5" x2="15.4" y2="17.5"></line><line x1="15.4" y1="6.5" x2="8.6" y2="10.5"></line></svg>Share</button>
                                                                                <button class="btn" onclick="videoStudio()"><svg viewBox="0 0 24 24"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2"></rect></svg>Video</button>
                                                                                <button class="btn btn-danger" onclick="clearCanvas()"><svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path></svg>Clear</button>
                                                                            </div>
                                                                        </div>'''

WALL_CLEAN_BTN = r'''<button class="fab-btn" onclick="toggleWallClean()" title="Whiteboard only (hide menus)" aria-label="Whiteboard only">
                                                                        <svg viewBox="0 0 24 24"><polyline points="15 3 21 3 21 9"></polyline><polyline points="9 21 3 21 3 15"></polyline><line x1="21" y1="3" x2="14" y2="10"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>
                                                                    </button>
                                                                    '''

UPDATE_CARD = r'''<div class="card" id="update-card" hidden>
                                                                        <div class="card-head">App updates</div>
                                                                        <button class="list-row" id="update-row" type="button" onclick="runUpdateAction()">
                                                                            <span class="lead">
                                                                                <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                                                                                <span><span id="update-title">Check for updates</span><small id="update-sub">Tap to check</small></span>
                                                                            </span>
                                                                            <span class="evlib-pill" id="update-pill" hidden>New</span>
                                                                        </button>
                                                                    </div>
                                                                    '''

# --------------------------------------------------------------------------- #
# CSS
# --------------------------------------------------------------------------- #
NEW_CSS = r'''<style id="artcher-update2">
        /* ---- Post pane redesign ---- */
        .post-where{font-size:11.5px;font-weight:700;color:var(--accent);background:var(--accent-soft);padding:6px 10px;border-radius:8px;text-align:center}
        .post-meter{display:flex;flex-direction:column;gap:6px;padding:10px 12px;border:1px solid var(--border);border-radius:12px;background:var(--soft)}
        .pm-top{display:flex;justify-content:space-between;align-items:baseline;font-size:11.5px;font-weight:700;color:var(--muted)}
        .pm-val{font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--ink)}
        .pm-track{height:6px;border-radius:999px;background:#e2e8f0;overflow:hidden}
        .pm-fill{height:100%;width:0;border-radius:inherit;background:#16a34a;transition:width .25s ease,background .2s}
        .pm-hint{font-size:11px;font-weight:600;color:var(--muted)}
        .post-meter[data-state="mid"] .pm-fill{background:#d97706}
        .post-meter[data-state="big"] .pm-fill{background:#dc2626}
        .post-meter[data-state="big"] .pm-hint{color:#dc2626}
        .post-tools{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;padding-top:10px;border-top:1px dashed var(--border)}
        .post-tools .btn{flex-direction:column;gap:3px;min-height:48px;padding:6px 2px;font-size:10.5px}
        .post-dot{width:6px;height:6px;border-radius:50%;background:#d97706;flex-shrink:0}
        .post-dot[data-state="big"]{background:#dc2626}

        /* ---- Wall: whiteboard-only mode ---- */
        body.wall-clean{--top:0px;--bottom:0px;--side:0px}
        body.wall-clean .topbar,
        body.wall-clean .bottom-nav,
        body.wall-clean .rail-tab,
        body.wall-clean .wall-hud,
        body.wall-clean .wall-fab,
        body.wall-clean #minimap,
        body.wall-clean .app-open-bar,
        body.wall-clean .work-chip,
        body.wall-clean #net-bar,
        body.wall-clean #weather-canvas,
        body.wall-clean #seasonal-canvas{display:none!important}
        .wall-clean-exit{position:absolute;z-index:30;top:calc(env(safe-area-inset-top,0px) + 10px);right:10px;width:34px;height:34px;
            border-radius:50%;border:1px solid var(--border);background:rgba(255,255,255,.88);color:var(--ink);
            font-size:14px;font-weight:700;line-height:1;cursor:pointer;opacity:.4;transition:opacity .15s}
        .wall-clean-exit:hover,.wall-clean-exit:active{opacity:1}
    </style>
'''

# --------------------------------------------------------------------------- #
# JS
# --------------------------------------------------------------------------- #
NEW_JS = r'''<script id="artcher-update2-js">
(function () {
    "use strict";
    var $ = function (id) { return document.getElementById(id); };
    var d = document, root = d.documentElement;

    /* ======================================================================
       1. WALL TILE RENDERING (fixes the stray whites)
       Render at 500px on a transparent layer (same as the editor and the popup),
       then scale down and lay it over the paper colour.
       ====================================================================== */
    var tileScratch = d.createElement("canvas");
    tileScratch.width = tileScratch.height = 500;
    var tileScratchCtx = tileScratch.getContext("2d", { willReadFrequently: true });

    window.getCachedTileCanvas = function (entry) {
        var hit = tileBitmapCache.get(entry.id);
        if (hit) return hit;
        var list = entry.strokes || [];
        tileScratchCtx.clearRect(0, 0, 500, 500);
        renderStrokesInstant(tileScratchCtx, list, 500, true);
        var cvs = d.createElement("canvas");
        cvs.width = cvs.height = 256;
        var c = cvs.getContext("2d");
        c.fillStyle = bgOf(list);
        c.fillRect(0, 0, 256, 256);
        c.imageSmoothingEnabled = true;
        c.imageSmoothingQuality = "high";
        c.drawImage(tileScratch, 0, 0, 256, 256);
        tileBitmapCache.set(entry.id, cvs);
        return cvs;
    };
    try { tileBitmapCache.clear(); scheduleWallPaint(); } catch (e) {}

    /* ======================================================================
       2. POST SIZE METER (moved out of the draw-hud)
       ====================================================================== */
    window.refreshSizeUI = function () {
        window.sizeTimer = 0;
        var mb = estimatePayloadMB();
        window.lastSizeMB = mb;
        var ratio = mb / POST_WARN_MB;
        var state = mb === 0 ? "empty" : ratio >= 1 ? "big" : ratio >= 0.6 ? "mid" : "ok";
        var hints = {
            empty: "Draw something to see the size",
            ok: "Light · uploads fast",
            mid: "Getting large",
            big: "Large drawing · may upload slowly"
        };
        var meter = $("post-meter"), val = $("pm-val"), fill = $("pm-fill"), hint = $("pm-hint"), dot = $("post-tab-dot");
        if (meter) meter.dataset.state = state;
        if (val) val.textContent = fmtMB(mb);
        if (fill) fill.style.width = (mb === 0 ? 0 : Math.max(4, Math.min(100, ratio * 100))) + "%";
        if (hint) hint.textContent = hints[state];
        if (dot) { dot.hidden = !(state === "mid" || state === "big"); dot.dataset.state = state; }
    };
    window.refreshSizeUI();

    /* ======================================================================
       3. TWO-FINGER DOUBLE TAP = REDO  (Ctrl+Y on desktop)
       A one-finger touch starts a stroke and wipes the redo list, so the list is
       snapshotted on the first finger and restored when the second finger lands.
       ====================================================================== */
    (function () {
        var frame = $("canvas-frame");
        if (!frame) return;
        var snapRedo = [], active = false, travel = false, t0 = 0, p0 = [], sc0 = 1, lastTap = 0;

        frame.addEventListener("touchstart", function (e) {
            if (e.touches.length === 1) {
                try { snapRedo = window.redoStack.slice(); } catch (_) { snapRedo = []; }
            } else if (e.touches.length === 2) {
                if (currentStroke && currentStroke.p && currentStroke.p.length <= 2 && snapRedo.length) {
                    try { window.redoStack = snapRedo.slice(); updateHistoryUI(); } catch (_) {}
                }
                active = true; travel = false; t0 = performance.now(); sc0 = studioScale;
                p0 = [[e.touches[0].clientX, e.touches[0].clientY], [e.touches[1].clientX, e.touches[1].clientY]];
            } else {
                active = false;
            }
        }, { capture: true, passive: true });

        frame.addEventListener("touchmove", function (e) {
            if (!active || e.touches.length !== 2) return;
            for (var i = 0; i < 2; i++) {
                if (Math.hypot(e.touches[i].clientX - p0[i][0], e.touches[i].clientY - p0[i][1]) > 14) travel = true;
            }
        }, { passive: true });

        frame.addEventListener("touchcancel", function () { active = false; }, { passive: true });

        frame.addEventListener("touchend", function (e) {
            if (!active || e.touches.length > 0) return;
            active = false;
            var now = performance.now();
            if (now - t0 > 280 || travel || Math.abs(studioScale - sc0) > 0.02) { lastTap = 0; return; }
            if (now - lastTap < 420) {
                lastTap = 0;
                if (window.redoStack.length) { redoStroke(); showToast("Redo"); haptic(10); }
                else showToast("Nothing to redo");
            } else {
                lastTap = now;
            }
        }, { passive: true });

        window.addEventListener("keydown", function (e) {
            if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "y") return;
            if (currentView !== "draw") return;
            var ae = d.activeElement;
            if (ae && (ae.tagName === "INPUT" || ae.isContentEditable)) return;
            e.preventDefault();
            redoStroke();
        });
    })();

    /* ======================================================================
       4. WALL: WHITEBOARD-ONLY FULLSCREEN
       ====================================================================== */
    var askedFs = false;
    function fsOn() { return !!(d.fullscreenElement || d.webkitFullscreenElement); }

    function relayout() {
        setTimeout(function () {
            window.dispatchEvent(new Event("resize"));
            try { if (currentView === "wall" && !userMoved) fitWallToScreen(); scheduleWallPaint(); } catch (e) {}
        }, 60);
    }

    function setWallClean(on) {
        on = !!on;
        if (on === d.body.classList.contains("wall-clean")) return;
        if (on && currentView !== "wall") switchView("wall");
        d.body.classList.toggle("wall-clean", on);
        var x = $("wall-clean-exit");
        if (x) x.hidden = !on;
        try {
            if (on && (d.fullscreenEnabled || d.webkitFullscreenEnabled) && !fsOn()) {
                askedFs = true;
                var p = (root.requestFullscreen || root.webkitRequestFullscreen).call(root);
                if (p && p.catch) p.catch(function () { askedFs = false; });
            } else if (!on && fsOn()) {
                askedFs = false;
                (d.exitFullscreen || d.webkitExitFullscreen).call(d);
            }
        } catch (e) { askedFs = false; }
        if (on) showToast("Whiteboard mode · tap ✕ or press Esc to exit");
        haptic(8);
        relayout();
    }
    window.setWallClean = setWallClean;
    window.toggleWallClean = function (force) {
        setWallClean(typeof force === "boolean" ? force : !d.body.classList.contains("wall-clean"));
    };

    (function () {
        var xb = d.createElement("button");
        xb.id = "wall-clean-exit";
        xb.type = "button";
        xb.className = "wall-clean-exit";
        xb.hidden = true;
        xb.textContent = "✕";
        xb.setAttribute("aria-label", "Exit whiteboard mode");
        xb.onclick = function () { setWallClean(false); };
        $("view-wall").appendChild(xb);
    })();

    ["fullscreenchange", "webkitfullscreenchange"].forEach(function (ev) {
        d.addEventListener(ev, function () {
            if (askedFs && !fsOn() && d.body.classList.contains("wall-clean")) { askedFs = false; setWallClean(false); }
        });
    });
    d.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && d.body.classList.contains("wall-clean") && !fsOn()) setWallClean(false);
    });

    var _sv = window.switchView;
    window.switchView = function (name) {
        if (name !== "wall" && d.body.classList.contains("wall-clean")) setWallClean(false);
        var r = _sv.apply(this, arguments);
        if (name === "more") loadVersionInfo(false);
        return r;
    };

    /* ======================================================================
       5. VERSION.JSON: APK link, appVersion, in-app "Download Update"
       ====================================================================== */
    var LS_VER = "fw_version_info_v1";
    var ver = lsGet(LS_VER, null);
    var lastVerFetch = 0;

    function hasNativeUpdate() { return !!(window.Android && typeof window.Android.checkForUpdate === "function"); }
    function inAppShell() { return typeof window.AndroidRadio !== "undefined" || typeof window.Android !== "undefined"; }
    function nativeInfo() {
        try {
            if (window.Android && typeof window.Android.getVersionInfo === "function") return JSON.parse(window.Android.getVersionInfo() || "{}");
        } catch (e) {}
        return {};
    }

    function applyVersion() {
        var ni = nativeInfo();

        // 1) APK links follow apkUrl
        if (ver && ver.apkUrl) {
            ["apk-prompt-link", "more-apk-link"].forEach(function (id) { var a = $(id); if (a) a.href = ver.apkUrl; });
        }
        var sm = d.querySelector("#more-apk-link small");
        if (sm && ver && ver.versionName) sm.textContent = "Latest v" + ver.versionName + " · optional native wrapper for offline drawing";

        // 2) appVersion under "ARCHERSTUDIO @ 2026"
        var line = $("app-version-line");
        if (line) {
            var parts = [];
            if (ver && ver.appVersion) parts.push("v" + ver.appVersion);
            if (ni.versionName) parts.push("APK " + ni.versionName);
            line.textContent = parts.join(" · ");
            line.hidden = !parts.length;
        }

        // 3) update card (only inside the Android app)
        var card = $("update-card");
        if (!card) return;
        card.hidden = !inAppShell();
        var has = !!(ver && ver.versionCode && ni.versionCode && ver.versionCode > ni.versionCode);
        var title = $("update-title"), sub = $("update-sub"), pill = $("update-pill");
        if (title) title.textContent = has ? "Download Update" : (hasNativeUpdate() ? "Check for updates" : "Download latest APK");
        if (sub) {
            if (has) sub.textContent = "v" + ver.versionName + " available · you have v" + ni.versionName;
            else if (ni.versionName) sub.textContent = "You have v" + ni.versionName + (ver && ver.versionName ? " · latest v" + ver.versionName : "");
            else sub.textContent = ver && ver.versionName ? "Latest v" + ver.versionName : "Tap to check";
        }
        if (pill) pill.hidden = !has;
    }

    function loadVersionInfo(force) {
        if (!force && Date.now() - lastVerFetch < 60000) return Promise.resolve();
        lastVerFetch = Date.now();
        return fetch("download/version.json?_t=" + Date.now(), { cache: "no-store" })
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (j) {
                if (j && typeof j === "object") { ver = j; lsSet(LS_VER, j); }
                applyVersion();
            })
            .catch(function () { applyVersion(); });
    }

    window.runUpdateAction = function () {
        haptic(8);
        if (hasNativeUpdate()) {
            window.Android.checkForUpdate();
            showToast("Checking for updates…");
        } else if (ver && ver.apkUrl) {
            showToast("Downloading APK…");
            window.location.href = ver.apkUrl;
        } else {
            loadVersionInfo(true).then(function () { showToast(ver ? "Latest v" + ver.versionName : "Couldn't reach the server."); });
        }
    };

    applyVersion();
    loadVersionInfo(true);
})();
</script>
'''


def main():
    path = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "freedomwall.html")
    if not path.exists():
        sys.exit(f"File not found: {path}")
    src = path.read_text(encoding="utf-8")
    if MARKER in src:
        sys.exit("Already patched (artcher-update2 found). Restore the .bak to re-run.")

    # --- draw-hud: remove the size readout ---------------------------------
    src = replace_once(src, '<span id="dh-size">0.000 MB</span>', '', "hud-size")

    # --- Post tab: warning dot ---------------------------------------------
    src = replace_once(
        src,
        '<polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>Post',
        '<polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>Post<span class="post-dot" id="post-tab-dot" hidden></span>',
        "post-tab-dot",
    )

    # --- Post pane redesign ------------------------------------------------
    src = regex_once(
        src,
        r'<div class="sheet-pane" id="pane-post">.*?id="studio-size-stats">.*?</div>\s*</div>',
        POST_PANE,
        "post-pane",
    )

    # --- Wall toolbar: whiteboard-only button ------------------------------
    fit_btn = '<button class="fab-btn" onclick="resetFit()" title="Fit wall to screen" aria-label="Fit wall to screen">'
    src = replace_once(src, fit_btn, WALL_CLEAN_BTN + fit_btn, "wall-fab")

    # --- More tab: appVersion line + update card ---------------------------
    credit = '<div class="more-credit">ARCHERSTUDIO @ 2026</div>'
    src = replace_once(
        src, credit,
        credit + '\n                                                                    <div class="more-credit" id="app-version-line" hidden></div>',
        "app-version-line",
    )
    apk_card = '<div class="card" id="more-apk-card" hidden>'
    src = replace_once(src, apk_card, UPDATE_CARD + apk_card, "update-card")

    # --- Leaderboard thumbs use the same renderer --------------------------
    src = replace_once(
        src,
        'renderStrokesInstant(c, entry.strokes || [], 112, false);',
        'c.drawImage(getCachedTileCanvas(entry), 0, 0, 112, 112);',
        "leaderboard-thumb",
    )

    # --- CSS + JS ----------------------------------------------------------
    src = replace_once(src, '</head>', NEW_CSS + '</head>', "css")
    src = replace_once(src, '</body>', NEW_JS + '</body>', "js")

    shutil.copy(path, str(path) + ".bak")
    path.write_text(src, encoding="utf-8")
    print(f"Patched {path}  (backup: {path}.bak)")


if __name__ == "__main__":
    main()