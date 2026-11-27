#!/usr/bin/env python3
"""
update_wall_landscape.py  -  landscape / horizontal-device upgrade for freedomwall.html

Usage:   python update_wall_landscape.py freedomwall.html

What it adds (landscape, width >= 640px only; portrait is untouched)
  * Canvas uses the full screen height (the old 92px of spare room is gone).
  * Undo / redo / mirror / zoom move into the right column so they no longer eat canvas height.
  * On short landscape screens (height <= 600px) the top bar hides while you are in Draw.
  * LEFT sidebar (nav rail): small edge tab to collapse / expand it. Remembered.
  * RIGHT sidebar (Style / Trace / Text / Layers / Shapes / Post): "panel" button in the toolbar
    collapses it to a slim vertical toolbar so the canvas can grow. Remembered.
  * Fullscreen button (browser Fullscreen API; hidden where unsupported, e.g. most WebViews).

Independent of update_wall.py; either order works. Writes <file>.bak first. Safe to re-run.
"""
import shutil
import sys

# top bar is hidden in Draw when the landscape screen is this short (px). Set to 0 to never hide it.
HIDE_TOPBAR_BELOW = 600

MARKER = 'id="artcher-landscape-js"'


def rep(src, old, new, label):
    n = src.count(old)
    if n != 1:
        sys.exit(f"[FAILED] {label}: expected 1 match, found {n}. Nothing was written.")
    return src.replace(old, new, 1)


CSS = r'''
<style id="artcher-landscape">
/* ---- new buttons: hidden outside landscape (fullscreen button is shown by JS when supported) ---- */
.studio-extra{display:flex;gap:5px}
#panel-toggle{display:none}
.rail-tab{display:none;position:fixed;z-index:101;top:50%;left:var(--side,0px);width:18px;height:56px;margin-top:-28px;padding:0;
  align-items:center;justify-content:center;cursor:pointer;color:var(--muted);background:#fff;
  border:1px solid var(--border);border-left:0;border-radius:0 12px 12px 0;box-shadow:2px 2px 8px rgba(15,23,42,.08)}
.rail-tab:active{background:var(--soft)}
.rail-tab svg{width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round;transition:transform .2s}
body.rail-collapsed .rail-tab svg{transform:rotate(180deg)}

@media (orientation: landscape) and (min-width: 640px) {
  .rail-tab{display:flex}
  #panel-toggle{display:inline-flex}

  /* ---- collapsible left rail ---- */
  .bottom-nav{transition:transform .22s ease}
  body.rail-collapsed{--side:0px}
  body.rail-collapsed .bottom-nav{transform:translateX(-100%);visibility:hidden;transition:transform .22s ease,visibility 0s linear .22s}

  /* ---- full-height canvas ---- */
  #view-draw{
    --pad:12px;
    --panel:clamp(240px,28vw,340px);
    --cv:max(160px,min(
      calc(100dvh - var(--top) - var(--safe-b) - 2 * var(--pad)),
      calc(100vw - var(--side) - 56px - var(--panel) - 76px)));
  }
  #view-draw.panel-off{--panel:52px}

  .studio-wrap{
    grid-template-columns:56px var(--cv) var(--panel);
    grid-template-rows:auto auto 1fr;
    align-items:start;
    padding:var(--pad) 0;
  }
  .tool-dock{grid-column:1;grid-row:1 / span 3}
  .canvas-frame{grid-column:2;grid-row:1 / span 3;width:var(--cv);min-width:0;margin:0}
  .studio-bar{grid-column:3;grid-row:1;flex-wrap:wrap;gap:6px}
  .draw-hud{grid-column:3;grid-row:2;width:auto;min-width:0}
  .sheet{grid-column:3;grid-row:3;max-height:calc(100dvh - var(--top) - var(--safe-b) - 140px);overflow-y:auto}

  /* ---- right panel collapsed: slim vertical toolbar ---- */
  #view-draw.panel-off .sheet,
  #view-draw.panel-off .draw-hud{display:none}
  #view-draw.panel-off .studio-bar{
    flex-direction:column;align-items:center;flex-wrap:nowrap;gap:8px;
    max-height:calc(100dvh - var(--top) - var(--safe-b) - 2 * var(--pad));
    overflow-y:auto;scrollbar-width:none}
  #view-draw.panel-off .studio-bar::-webkit-scrollbar{display:none}
  #view-draw.panel-off .history,
  #view-draw.panel-off .studio-extra,
  #view-draw.panel-off .studio-zoom-group{flex-direction:column}
  #view-draw.panel-off #sym-label{display:none}
  #view-draw.panel-off .studio-zoom-btn{width:100%}
  #view-draw.panel-off .studio-zoom-level{
    border:0;border-top:1px solid var(--border);border-bottom:1px solid var(--border);min-width:34px;width:100%}
}

/* ---- short landscape screens: give Draw the whole height ---- */
@media (orientation: landscape) and (min-width: 640px) and (max-height: __HIDE__px) {
  body[data-view="draw"]{--top:var(--safe-t)}
  body[data-view="draw"] .topbar{display:none}
}
</style>
'''.replace("__HIDE__", str(HIDE_TOPBAR_BELOW if HIDE_TOPBAR_BELOW > 0 else 0))

# when HIDE_TOPBAR_BELOW is 0 the media query can never match a real screen (max-height:0px)

RAIL_TAB = r'''<!-- SIDEBAR TAB -->
                    <button type="button" class="rail-tab" id="rail-tab" onclick="toggleRail()" aria-expanded="true" aria-label="Collapse sidebar" title="Collapse sidebar">
                        <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"></polyline></svg>
                    </button>

                    <!-- BOTTOM NAV -->'''

TOOLBAR_EXTRA = r'''<div class="studio-extra">
                                        <button type="button" class="chip-btn" id="panel-toggle" onclick="togglePanel()" aria-pressed="false" aria-label="Collapse side panel" title="Collapse / expand the side panel">
                                            <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"></rect><line x1="15" y1="4" x2="15" y2="20"></line></svg>
                                        </button>
                                        <button type="button" class="chip-btn" id="fs-btn" onclick="toggleFullscreen()" hidden aria-label="Fullscreen" title="Fullscreen">
                                            <svg viewBox="0 0 24 24"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path></svg>
                                        </button>
                                    </div>
                                    <div class="studio-zoom-group" role="group" aria-label="Canvas zoom controls">'''

JS = r'''
<script id="artcher-landscape-js">
(function () {
    "use strict";
    var $ = function (id) { return document.getElementById(id); };
    var LS_RAIL = "fw_rail_collapsed_v1";
    var LS_PANEL = "fw_panel_collapsed_v1";

    // after a layout change: let the canvas / wall / weather re-measure themselves
    function relayout() {
        setTimeout(function () {
            window.dispatchEvent(new Event("resize"));
            try { syncUnit(); } catch (e) {}
            try { if (typeof scheduleWallPaint === "function") scheduleWallPaint(); } catch (e) {}
        }, 40);
    }

    // ---------------- left rail ----------------
    function applyRail(collapsed) {
        document.body.classList.toggle("rail-collapsed", !!collapsed);
        var t = $("rail-tab");
        if (t) {
            t.setAttribute("aria-expanded", String(!collapsed));
            var label = collapsed ? "Show sidebar" : "Collapse sidebar";
            t.setAttribute("aria-label", label);
            t.title = label;
        }
    }
    window.toggleRail = function () {
        var c = !document.body.classList.contains("rail-collapsed");
        lsSet(LS_RAIL, c);
        applyRail(c);
        haptic(8);
        relayout();
    };

    // ---------------- right panel (Draw) ----------------
    function applyPanel(collapsed) {
        var v = $("view-draw");
        if (v) v.classList.toggle("panel-off", !!collapsed);
        var b = $("panel-toggle");
        if (b) {
            b.classList.toggle("active", !!collapsed);
            b.setAttribute("aria-pressed", String(!!collapsed));
            var label = collapsed ? "Show side panel" : "Collapse side panel";
            b.setAttribute("aria-label", label);
            b.title = label;
        }
    }
    window.togglePanel = function () {
        var v = $("view-draw");
        var c = !(v && v.classList.contains("panel-off"));
        lsSet(LS_PANEL, c);
        applyPanel(c);
        haptic(8);
        relayout();
    };

    // ---------------- fullscreen ----------------
    var d = document, root = d.documentElement;
    var fsSupported = !!(d.fullscreenEnabled || d.webkitFullscreenEnabled);
    function fsActive() { return !!(d.fullscreenElement || d.webkitFullscreenElement); }
    function syncFsButton() {
        var b = $("fs-btn");
        if (!b) return;
        b.hidden = !fsSupported;
        b.classList.toggle("active", fsActive());
    }
    window.toggleFullscreen = function () {
        try {
            var p;
            if (fsActive()) p = (d.exitFullscreen || d.webkitExitFullscreen).call(d);
            else p = (root.requestFullscreen || root.webkitRequestFullscreen).call(root);
            if (p && p.catch) p.catch(function () { showToast("Fullscreen isn't available here."); });
        } catch (e) {
            showToast("Fullscreen isn't available here.");
        }
    };
    ["fullscreenchange", "webkitfullscreenchange"].forEach(function (ev) {
        d.addEventListener(ev, function () { syncFsButton(); relayout(); });
    });

    // ---------------- current view on <body> (lets CSS hide the top bar in Draw) ----------------
    var _switchView = window.switchView;
    if (typeof _switchView === "function") {
        window.switchView = function (name) {
            var r = _switchView.apply(this, arguments);
            document.body.dataset.view = name;
            return r;
        };
    }
    document.body.dataset.view = (typeof currentView === "string" && currentView) || "home";

    // ---------------- restore saved state ----------------
    applyRail(lsGet(LS_RAIL, false) === true);
    applyPanel(lsGet(LS_PANEL, false) === true);
    syncFsButton();
    relayout();
})();
</script>
'''


def main():
    if len(sys.argv) < 2:
        sys.exit("Usage: python update_wall_landscape.py freedomwall.html")
    path = sys.argv[1]
    with open(path, "r", encoding="utf-8") as f:
        html = f.read()

    if MARKER in html:
        print("Already applied - nothing to do.")
        return

    html = rep(html, "</head>", CSS + "</head>", "css (</head>)")
    html = rep(html, "<!-- BOTTOM NAV -->", RAIL_TAB, "sidebar tab")
    html = rep(
        html,
        '<div class="studio-zoom-group" role="group" aria-label="Canvas zoom controls">',
        TOOLBAR_EXTRA,
        "toolbar buttons",
    )
    html = rep(html, "</body>", JS + "</body>", "script (</body>)")

    shutil.copyfile(path, path + ".bak")
    with open(path, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"Done. Backup saved as {path}.bak")


if __name__ == "__main__":
    main()