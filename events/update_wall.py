#!/usr/bin/env python3
"""
update_wall.py  -  adds "Hide arts for now" + theater-curtain reveal to freedomwall.html

Usage:   python update_wall.py freedomwall.html

What it does
  * Host (Event > host panel) gets a "Hide arts for now" switch, an "Ask before revealing" option,
    and a "Start with the curtain closed" checkbox when creating an event.
  * While hidden, everyone except the host sees a blank wall: closed curtain + logo + app name + "No drawing yet!".
  * Host flips the switch back -> (optional confirmation) -> curtain opens on every device ->
    after the curtain is gone the drawings start replaying.

Run the Apps Script part (events_hidden.gs) FIRST, then redeploy the web app.
A backup is written to <file>.bak before anything changes. Safe to re-run (it detects itself).
"""
import shutil
import sys

# --- change these if you like -------------------------------------------------------------
CURTAIN_IMG = "https://img.magnific.com/premium-photo/red-theatre-entertainment-event-curtain-3d-rendering_601748-35555.jpg?semt=ais_hybrid&w=740&q=80"
CURTAIN_LOGO = "../resources/image/logo/logo4.png"
CURTAIN_TITLE = "THE ARTcher"
CURTAIN_SUB = "ARCHERSTUDIO"
# -------------------------------------------------------------------------------------------

MARKER = 'id="artcher-curtain-js"'


def rep(src, old, new, label):
    n = src.count(old)
    if n != 1:
        sys.exit(f"[FAILED] {label}: expected 1 match, found {n}. Nothing was written.")
    return src.replace(old, new, 1)


# =============================== CSS ===============================
CSS = r'''
<style id="artcher-curtain">
/* ---- host controls ---- */
.host-controls{display:flex;flex-direction:column;gap:10px;padding:12px;border:1px solid var(--border);border-radius:14px;background:var(--soft)}
.host-switch-row{display:flex;align-items:center;justify-content:space-between;gap:12px;cursor:pointer}
.host-switch-row strong{display:block;font-size:14px}
.host-switch-row small{display:block;font-size:12px;font-weight:500;color:var(--muted);margin-top:2px;line-height:1.3}

/* ---- wall state while the curtain is involved ---- */
#view-wall.curtain-hold .wall-tile{visibility:hidden}
#view-wall.curtain-closed .wall-hud > :not(#event-btn):not(#event-pill):not(#dock-upload-btn){display:none!important}
#view-wall.curtain-closed #minimap,
#view-wall.curtain-closed .wall-fab{display:none!important}

/* ---- the curtain ---- */
.curtain-stage{position:absolute;inset:0;z-index:12;overflow:hidden;touch-action:none;
  background:radial-gradient(ellipse at 50% 0%,#3b0a0a,#12030a 75%);--curtain-ms:2800ms}
.curtain-panel{position:absolute;top:0;bottom:0;width:50.4%;
  background-color:#7f1d1d;
  background-image:url("__CURTAIN_IMG__"),repeating-linear-gradient(90deg,#7f1d1d 0,#b91c1c 22px,#7f1d1d 44px);
  background-size:200% 100%,auto;
  transition:transform var(--curtain-ms) cubic-bezier(.6,.02,.2,1);
  will-change:transform}
.curtain-panel.left{left:0;background-position:left center,0 0;transform-origin:left center;box-shadow:inset -22px 0 30px rgba(0,0,0,.38)}
.curtain-panel.right{right:0;background-position:right center,0 0;transform-origin:right center;box-shadow:inset 22px 0 30px rgba(0,0,0,.38)}
.curtain-panel::after{content:"";position:absolute;inset:0;pointer-events:none;
  background:repeating-linear-gradient(90deg,rgba(0,0,0,.22) 0,rgba(0,0,0,0) 14px,rgba(255,255,255,.05) 28px,rgba(0,0,0,.22) 42px)}
.curtain-stage.open .curtain-panel{transform:scaleX(.12)}

.curtain-emblem{position:absolute;inset:0;z-index:4;display:flex;flex-direction:column;align-items:center;justify-content:center;
  gap:10px;text-align:center;padding:24px;pointer-events:none;color:#fff;text-shadow:0 2px 14px rgba(0,0,0,.7);
  transition:opacity .6s ease,transform .9s ease}
.curtain-emblem img{width:clamp(84px,24vw,140px);height:auto;filter:drop-shadow(0 6px 18px rgba(0,0,0,.55))}
.curtain-name{font-size:clamp(26px,7vw,44px);font-weight:900;letter-spacing:.06em;text-transform:uppercase;line-height:1.05}
.curtain-sub{font:600 11px 'JetBrains Mono',monospace;letter-spacing:.24em;text-transform:uppercase;opacity:.85}
.curtain-event{font-size:13px;font-weight:700;opacity:.9;max-width:80%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.curtain-empty{margin-top:8px;padding:8px 16px;border-radius:999px;background:rgba(0,0,0,.45);
  border:1px solid rgba(255,255,255,.28);font-size:13px;font-weight:700;backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px)}
.curtain-stage.open .curtain-emblem{opacity:0;transform:scale(1.12)}
.curtain-stage.no-anim .curtain-panel,.curtain-stage.no-anim .curtain-emblem{transition:none!important}
</style>
'''.replace("__CURTAIN_IMG__", CURTAIN_IMG)

# =============================== curtain markup ===============================
CURTAIN_HTML = r'''
                        <div class="curtain-stage" id="curtain-stage" hidden role="status" aria-live="polite">
                            <div class="curtain-panel left"></div>
                            <div class="curtain-panel right"></div>
                            <div class="curtain-emblem">
                                <img src="__LOGO__" alt="" onerror="this.style.display='none'">
                                <div class="curtain-name">__TITLE__</div>
                                <div class="curtain-sub">__SUB__</div>
                                <div class="curtain-event" id="curtain-event-name"></div>
                                <div class="curtain-empty">No drawing yet!</div>
                            </div>
                        </div>
'''.replace("__LOGO__", CURTAIN_LOGO).replace("__TITLE__", CURTAIN_TITLE).replace("__SUB__", CURTAIN_SUB)

# =============================== host controls markup ===============================
HOST_CONTROLS = r'''<div class="host-controls" id="event-host-controls" hidden>
                                <label class="host-switch-row">
                                    <span><strong>Hide arts for now</strong><small>Guests see a closed curtain and an empty wall. Only you can see the drawings.</small></span>
                                    <span class="switch"><input type="checkbox" id="event-hide-switch" onchange="onHideSwitch(this)"></span>
                                </label>
                                <label class="anon-check-row" for="event-confirm-reveal">
                                    <input type="checkbox" id="event-confirm-reveal" checked onchange="onConfirmRevealToggle(this)">
                                    <span>Ask before revealing</span>
                                </label>
                            </div>

                            <details id="event-host">'''

START_HIDDEN = r'''<label class="anon-check-row" for="event-start-hidden">
                                        <input type="checkbox" id="event-start-hidden">
                                        <span>Start with the curtain closed (hide arts)</span>
                                    </label>
                                    <button type="button" class="btn btn-primary" onclick="hostEvent()">Create event</button>'''

# =============================== JS ===============================
JS = r'''
<script id="artcher-curtain-js">
(function () {
    "use strict";
    var $ = function (id) { return document.getElementById(id); };
    var LS_CONFIRM = "fw_reveal_confirm_v1";
    var reduceMotion = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    var CURTAIN_MS = reduceMotion ? 700 : 2800;

    window.curtainHold = false;            // while true the wall canvas stays blank
    var curtainClosedShown = false;        // a closed curtain is (or was) on screen
    var revealing = false;
    var lastHiddenForMe = null;
    var curtainRun = 0;

    function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
    function wrap(name, make) {
        var orig = window[name];
        if (typeof orig !== "function") return;
        window[name] = make(orig);
    }

    // true for everybody except the host while the host has the arts hidden
    function hiddenForMe() {
        return !!curEvent && !!curEvent.hidden && curEvent.status === "active" && !isHost();
    }
    window.evHiddenForMe = hiddenForMe;

    function setHold(on) {
        window.curtainHold = !!on;
        var v = $("view-wall");
        if (v) v.classList.toggle("curtain-hold", !!on);
        if (!on && typeof scheduleWallPaint === "function") scheduleWallPaint();
    }

    function paintClosedText() {
        var n = $("curtain-event-name");
        if (n) n.textContent = curEvent ? curEvent.name : "";
    }

    // curtain is shown closed. animate=true plays the "curtain closes" animation.
    function showClosed(animate) {
        var st = $("curtain-stage"), v = $("view-wall");
        curtainRun++;
        revealing = false;
        setHold(true);
        v.classList.add("curtain-closed");
        paintClosedText();
        curtainClosedShown = true;
        st.style.setProperty("--curtain-ms", CURTAIN_MS + "ms");
        st.hidden = false;
        if (animate) {
            st.classList.add("no-anim", "open");
            void st.offsetWidth;
            st.classList.remove("no-anim");
            void st.offsetWidth;
            st.classList.remove("open");
        } else {
            st.classList.remove("open");
        }
    }

    // curtain rolls open, then the drawings start drawing
    async function playReveal() {
        if (revealing) return;
        revealing = true;
        var run = ++curtainRun;
        var st = $("curtain-stage"), v = $("view-wall");
        try {
            setHold(true);
            for (var i = 0; i < 40 && loadingWall; i++) await sleep(150);
            if (run !== curtainRun) return;
            try { await loadWallEntries({ autoPlay: false, manual: false }); } catch (e) {}
            if (run !== curtainRun) return;

            haptic(20);
            st.style.setProperty("--curtain-ms", CURTAIN_MS + "ms");
            st.classList.add("open");
            await sleep(CURTAIN_MS + 150);
            if (run !== curtainRun) return;

            st.hidden = true;
            st.classList.remove("open");
            v.classList.remove("curtain-closed");
            curtainClosedShown = false;
            setHold(false);
            if (currentView === "wall") { userMoved = false; renderWall(true); }   // drawings start now
            launchConfetti();
            showToast("🎭 The art is revealed!");
        } finally {
            if (run === curtainRun) revealing = false;
        }
    }

    function refreshCurtain() {
        var st = $("curtain-stage"), v = $("view-wall");
        if (!st || !v) return;
        var must = hiddenForMe();
        var was = lastHiddenForMe;
        lastHiddenForMe = must;

        if (must) {
            if (!curtainClosedShown || st.hidden || revealing) showClosed(was === false && currentView === "wall");
            else paintClosedText();
            return;
        }
        if (curtainClosedShown) {                       // it was hidden, now it is not
            if (currentView === "wall") playReveal();   // otherwise wait until the Wall tab is opened
            return;
        }
        st.hidden = true;
        v.classList.remove("curtain-closed");
        if (window.curtainHold) setHold(false);
    }

    // ---------------- host actions ----------------
    var hideBusy = false;
    async function setEventHidden(hide) {
        if (!curEvent || !isHost() || hideBusy) return;
        hideBusy = true;
        var code = curEvent.code;
        try {
            var j = await gasPost({ action: "setFWEventHidden", code: code, hostToken: hostToken(code), hidden: !!hide });
            if (!j || !j.ok) { showToast((j && j.error) || "Couldn't update the event."); return; }
            if (curEvent && curEvent.code === code) {
                curEvent = Object.assign({}, curEvent, j.event);
                lsSet(LS_EVENT, curEvent);
            }
            try {
                if (wallChannel && wallChannel.state === "joined") {
                    wallChannel.send({ type: "broadcast", event: "event-visibility", payload: { code: code, hidden: !!hide } });
                }
            } catch (e) {}
            applyEventUI();
            showToast(hide ? "Arts hidden · guests see the closed curtain 🎭" : "Arts revealed 🎉");
            haptic(12);
        } catch (e) {
            showToast("Couldn't reach the server.");
        } finally {
            hideBusy = false;
            renderEventModal();
        }
    }

    // the switch means "arts are hidden". Turning it off = reveal.
    window.onHideSwitch = function (sw) {
        if (!curEvent || !isHost()) { sw.checked = !!(curEvent && curEvent.hidden); return; }
        if (sw.checked) { setEventHidden(true); return; }
        sw.checked = true;                               // stays on until the reveal really happened
        var go = function () { setEventHidden(false); };
        if (lsGet(LS_CONFIRM, true) !== false) {
            askConsent("Reveal the art?",
                "The curtain opens on every guest's screen and all drawings start replaying. You can hide them again later.",
                go, { okLabel: "Open curtain" });
        } else {
            go();
        }
    };
    window.onConfirmRevealToggle = function (cb) {
        lsSet(LS_CONFIRM, !!cb.checked);
        showToast(cb.checked ? "Will ask before revealing" : "Reveal won't ask first");
    };

    // ---------------- guests: realtime + polling ----------------
    async function syncEventMeta() {
        if (!curEvent) return;
        var code = curEvent.code;
        try {
            var res = await fetch(GAS_WEB_APP_URL + "?module=fwevent&code=" + encodeURIComponent(code) + "&_t=" + Date.now());
            var j = await res.json();
            if (j && j.ok && j.event && curEvent && curEvent.code === code) noteEventMeta(j.event);
        } catch (e) {}
    }
    // the broadcast is only a nudge; the server decides (so a fake broadcast can't open the curtain)
    window.onEventVisibility = function (p) {
        if (!p || !curEvent || p.code !== curEvent.code) return;
        syncEventMeta();
    };
    setInterval(function () {
        if (curEvent && curEvent.hidden && curEvent.status === "active" && !isHost() && !document.hidden && navigator.onLine) syncEventMeta();
    }, 10000);

    // ---------------- hook into the existing functions ----------------
    wrap("setScope", function (orig) {
        return function () {
            curtainRun++;
            revealing = false;
            curtainClosedShown = false;
            lastHiddenForMe = null;
            var st = $("curtain-stage"), v = $("view-wall");
            if (st) { st.hidden = true; st.classList.remove("open"); }
            if (v) v.classList.remove("curtain-closed");
            setHold(false);
            return orig.apply(this, arguments);
        };
    });

    wrap("applyEventUI", function (orig) {
        return function () {
            var r = orig.apply(this, arguments);
            try {
                if (curEvent && curEvent.hidden && curEvent.status === "active") {
                    var pill = $("event-pill");
                    if (pill && !pill.hidden && isHost()) pill.textContent += " · 🎭 hidden";
                    var note = $("event-post-note");
                    if (note) note.textContent += isHost() ? " · hidden from guests" : " · art stays hidden until the host reveals it";
                }
                refreshCurtain();
            } catch (e) {}
            return r;
        };
    });

    wrap("renderEventModal", function (orig) {
        return function () {
            var r = orig.apply(this, arguments);
            var box = $("event-host-controls");
            if (!box) return r;
            var show = !!curEvent && curEvent.status === "active" && isHost();
            box.hidden = !show;
            if (show) {
                $("event-hide-switch").checked = !!curEvent.hidden;
                $("event-confirm-reveal").checked = lsGet(LS_CONFIRM, true) !== false;
            }
            return r;
        };
    });

    wrap("switchView", function (orig) {
        return function (name) {
            var r = orig.apply(this, arguments);
            if (name === "wall") refreshCurtain();
            return r;
        };
    });

    refreshCurtain();
})();
</script>
'''


def main():
    if len(sys.argv) < 2:
        sys.exit("Usage: python update_wall.py freedomwall.html")
    path = sys.argv[1]
    with open(path, "r", encoding="utf-8") as f:
        html = f.read()

    if MARKER in html:
        print("Already applied - nothing to do.")
        return

    # 1. css
    html = rep(html, "</head>", CSS + "</head>", "css (</head>)")

    # 2. curtain markup at the top of the wall view
    wall_open = '<section id="view-wall" class="view">'
    html = rep(html, wall_open, wall_open + "\n" + CURTAIN_HTML, "curtain markup")

    # 3. host controls (above the 'Host an event' block)
    html = rep(html, '<details id="event-host">', HOST_CONTROLS, "host controls")

    # 4. 'start hidden' checkbox in the create-event form
    html = rep(
        html,
        '<button type="button" class="btn btn-primary" onclick="hostEvent()">Create event</button>',
        START_HIDDEN,
        "start-hidden checkbox",
    )

    # 5. send 'hidden' when creating an event
    html = rep(
        html,
        'const j = await gasPost({ action: "createFWEvent", name, hours });',
        'const j = await gasPost({ action: "createFWEvent", name, hours, hidden: !!(evEl("event-start-hidden") && evEl("event-start-hidden").checked) });',
        "createFWEvent payload",
    )

    # 6. the host's token lets the server return the drawings of a hidden event
    html = rep(
        html,
        "?module=freedomwall&event=${encodeURIComponent(code)}&_t=${Date.now()}",
        "?module=freedomwall&event=${encodeURIComponent(code)}&hostToken=${encodeURIComponent(hostToken(code))}&_t=${Date.now()}",
        "fetchServerEntries hostToken",
    )

    # 7. keep the wall canvas blank while the curtain holds it
    border_line = 'const showBorders = document.getElementById("opt-borders") && document.getElementById("opt-borders").checked;'
    html = rep(html, border_line, "if (window.curtainHold) return;\n                            " + border_line, "paint hold")

    # 8. realtime: listen for hide/reveal (must be added before .subscribe)
    new_tile_on = '.on("broadcast", { event: "new-tile" }, ({ payload }) => {'
    html = rep(
        html,
        new_tile_on,
        '.on("broadcast", { event: "event-visibility" }, ({ payload }) => { if (window.onEventVisibility) window.onEventVisibility(payload); })\n                            '
        + new_tile_on,
        "realtime event-visibility",
    )

    # 9. guests ignore live tiles of a hidden event
    html = rep(
        html,
        'if ((payload.event || "") !== evCode()) return;',
        'if ((payload.event || "") !== evCode()) return;\n                                if (window.evHiddenForMe && window.evHiddenForMe()) return;',
        "ignore live tiles while hidden",
    )

    # 10. don't broadcast strokes of a hidden event
    html = rep(
        html,
        "payload: rawSize < 200000",
        'payload: (rawSize < 200000 && !(curEvent && curEvent.hidden && (entry.event || "") === curEvent.code))',
        "broadcast without strokes while hidden",
    )

    # 11. the server may move a tile to a free square (guests can't see taken squares while hidden)
    html = rep(
        html,
        "snap.occupied.push(entry);",
        'if (typeof json.gx === "number" && typeof json.gy === "number") { entry.gx = json.gx; entry.gy = json.gy; }\n                                        snap.occupied.push(entry);',
        "adopt server slot",
    )

    # 12. the new script, last thing before </body>
    html = rep(html, "</body>", JS + "</body>", "script (</body>)")

    shutil.copyfile(path, path + ".bak")
    with open(path, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"Done. Backup saved as {path}.bak")


if __name__ == "__main__":
    main()