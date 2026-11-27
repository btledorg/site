#!/usr/bin/env python3
"""
update_wall.py - patches freedomwall.html

  python update_wall.py freedomwall.html

Adds:
  1. Draw tab is disabled while the current event has ended / is archived
  2. Inside an event the tile picker is skipped, so the tile is always random
  3. Event Library (events you joined or hosted, live + archived)
  4. Event QR code generator (PNG save / share / copy link)
  5. Android: tries to open the link in the app com.artcher.app,
     and shows an "Open in app" bar as a tap-to-open fallback
"""
import re
import shutil
import sys
from pathlib import Path

CSS = r"""
/* ===== Event lock / library / QR / open-in-app ===== */
.nav-item.is-disabled{opacity:.5}
.nav-item.nav-draw.is-disabled .ico{background:#94a3b8;box-shadow:none}
.landing-buttons .btn.is-disabled{opacity:.45}

#evlib-modal{z-index:205}
#evqr-modal{z-index:206}
.evlib-sub{font-size:12.5px;color:var(--muted);margin-top:-6px;line-height:1.4}
.evlib-list{display:flex;flex-direction:column;gap:8px;max-height:min(60vh,420px);overflow-y:auto}
.evlib-h{margin-top:4px}
.evlib-row{display:flex;align-items:center;gap:8px;padding:10px;border:1px solid var(--border);border-radius:12px;background:#fff}
.evlib-row.current{border-color:#93c5fd;background:var(--accent-soft)}
.evlib-info{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}
.evlib-name{font-size:14px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.evlib-meta{font:600 10.5px 'JetBrains Mono',monospace;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.evlib-pill{align-self:flex-start;padding:1px 8px;border-radius:999px;font-size:10px;font-weight:800;background:#dcfce7;color:#166534}
.evlib-pill.done{background:#e2e8f0;color:#475569}
.evlib-actions{display:flex;gap:4px;flex-shrink:0}
.evqr-wrap canvas{width:100%;height:auto;display:block;border:1px solid var(--border);border-radius:12px;background:#fff}
.evqr-row{display:flex;gap:8px}
.evqr-row .name-input{text-transform:uppercase;letter-spacing:.15em;font-family:'JetBrains Mono',monospace}

.app-open-bar{
  position:fixed;left:12px;right:12px;bottom:calc(var(--bottom) + 12px);z-index:150;
  max-width:420px;margin:0 auto;display:flex;align-items:center;gap:10px;
  padding:10px 12px;border-radius:14px;background:#fff;border:1px solid var(--border);
  box-shadow:0 10px 28px rgba(15,23,42,.18)}
.app-open-bar .aob-text{flex:1;min-width:0;display:flex;flex-direction:column;line-height:1.25}
.app-open-bar strong{font-size:13px}
.app-open-bar small{font-size:11px;color:var(--muted)}
"""

JS = r"""
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var LS_LIB = "fw_event_library_v1";
  var LS_OPENAPP = "fw_open_in_app_v1";
  var SS_TRY = "fw_app_try_v1";
  var SS_BAR = "fw_app_bar_closed_v1";
  var APP_PKG = "com.artcher.app";

  function wrap(name, make) {
    var o = window[name];
    if (typeof o === "function") window[name] = make(o);
  }
  function mk(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function evEnded() { return !!curEvent && !evIsLive(); }
  function inviteUrl(code) { return location.origin + location.pathname + "?event=" + code; }

  // ======================================================================
  // 1. DRAW TAB LOCK WHEN THE EVENT HAS ENDED
  // ======================================================================
  function applyDrawLock() {
    var ended = evEnded();
    var nav = document.querySelector('.nav-item[data-view="draw"]');
    if (nav) {
      nav.classList.toggle("is-disabled", ended);
      nav.setAttribute("aria-disabled", String(ended));
      nav.title = ended ? "Event ended - drawing is closed" : "";
    }
    var start = document.querySelector(".landing-buttons .btn-primary");
    if (start) start.classList.toggle("is-disabled", ended);
    if (ended && currentView === "draw") window.switchView("wall");
  }

  wrap("switchView", function (o) {
    return function (name) {
      if (name === "draw" && evEnded()) {
        showToast("This event has ended, so drawing is closed. Leave the event to draw on the main wall.");
        haptic(20);
        return;
      }
      return o.apply(this, arguments);
    };
  });

  // ======================================================================
  // 2. INSIDE AN EVENT: NO TILE PICKING, ALWAYS RANDOM
  // ======================================================================
  wrap("openTilePicker", function (o) {
    return function (onOk) {
      if (curEvent) {
        window.__chosenSlot = null;            // submitToWallCore then uses pickRandomOpenSlot()
        if (typeof onOk === "function") onOk();
        return;
      }
      return o.apply(this, arguments);
    };
  });

  wrap("applyEventUI", function (o) {
    return function () {
      var r = o.apply(this, arguments);
      try {
        var note = $("event-post-note");
        if (note && curEvent && evIsLive() && note.textContent.indexOf("random tile") < 0) {
          note.textContent += " · random tile";
        }
        applyDrawLock();
      } catch (e) {}
      return r;
    };
  });

  // ======================================================================
  // 3. EVENT LIBRARY
  // ======================================================================
  function libGet() { var a = lsGet(LS_LIB, []); return Array.isArray(a) ? a : []; }
  function libSet(a) { lsSet(LS_LIB, a.slice(0, 60)); }
  function entryEnded(e) { return e.status !== "active" || Date.now() >= (e.endTs || 0); }
  function fmtDate(ts) {
    try { return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }); }
    catch (x) { return ""; }
  }

  function libUpsert(ev, keepOrder) {
    if (!ev || !ev.code) return;
    var a = libGet();
    var i = a.findIndex(function (x) { return x.code === ev.code; });
    var old = i >= 0 ? a[i] : null;
    var rec = {
      code: ev.code,
      name: ev.name || (old && old.name) || ev.code,
      startTs: ev.startTs || (old && old.startTs) || 0,
      endTs: ev.endTs || (old && old.endTs) || 0,
      status: ev.status || (old && old.status) || "active",
      joinedAt: old ? old.joinedAt : Date.now(),
      hosted: !!((old && old.hosted) || hostToken(ev.code))
    };
    if (old) a.splice(i, 1);
    if (old && keepOrder) a.splice(i, 0, rec); else a.unshift(rec);
    libSet(a);
    renderLib();
  }

  wrap("setScope", function (o) {
    return function (ev) {
      var r = o.apply(this, arguments);
      if (ev) libUpsert(ev);
      return r;
    };
  });
  wrap("noteEventMeta", function (o) {
    return function (meta) {
      if (meta && meta.code) libUpsert(meta, true);   // before it may auto-leave an archived event
      return o.apply(this, arguments);
    };
  });

  function libRow(e) {
    var row = mk("div", "evlib-row" + (curEvent && curEvent.code === e.code ? " current" : ""));
    var info = mk("div", "evlib-info");
    info.appendChild(mk("div", "evlib-name", e.name));
    var ended = entryEnded(e);
    var meta = e.code + (e.startTs ? " · " + fmtDate(e.startTs) : "") + (e.hosted ? " · hosted" : "");
    info.appendChild(mk("div", "evlib-meta", meta));
    info.appendChild(mk("span", "evlib-pill" + (ended ? " done" : ""), ended ? "Archived" : fmtLeft(e.endTs - Date.now())));

    var acts = mk("div", "evlib-actions");
    var open = mk("button", "btn btn-sm btn-primary", "Open"); open.type = "button";
    open.onclick = function () { openLibEvent(e); };
    var qr = mk("button", "btn btn-sm", "QR"); qr.type = "button";
    qr.onclick = function () { openEventQR(e); };
    var del = mk("button", "btn btn-sm", "✕"); del.type = "button";
    del.title = "Remove from library"; del.setAttribute("aria-label", "Remove from library");
    del.onclick = function () {
      askConsent("Remove from library?", "\"" + e.name + "\" is removed from this list. The event itself is not deleted.", function () {
        libSet(libGet().filter(function (x) { return x.code !== e.code; }));
        renderLib();
      }, { danger: true, okLabel: "Remove" });
    };
    acts.append(open, qr, del);
    row.append(info, acts);
    return row;
  }

  function renderLib() {
    var a = libGet();
    var sub = $("evlib-more-sub");
    if (sub) sub.textContent = a.length ? a.length + " saved · live & archived" : "Events you join are saved here";
    var list = $("evlib-list");
    if (!list) return;
    list.replaceChildren();
    if (!a.length) {
      list.appendChild(mk("div", "lb-empty", "No events yet. Join or host one and it will appear here."));
      return;
    }
    var live = a.filter(function (e) { return !entryEnded(e); });
    var done = a.filter(entryEnded);
    [["Live now", live], ["Archive", done]].forEach(function (g) {
      if (!g[1].length) return;
      list.appendChild(mk("div", "saved-label evlib-h", g[0]));
      g[1].forEach(function (e) { list.appendChild(libRow(e)); });
    });
  }

  function openLibEvent(e) {
    closeLib();
    if (curEvent && curEvent.code === e.code) { switchView("wall"); return; }
    joinEventByCode(e.code).then(function (ok) { if (ok) switchView("wall"); });
  }

  async function refreshLibStatuses() {
    if (!navigator.onLine) return;
    var a = libGet().slice(0, 20);
    await Promise.all(a.map(async function (e) {
      try {
        var res = await fetch(GAS_WEB_APP_URL + "?module=fwevent&code=" + encodeURIComponent(e.code) + "&_t=" + Date.now());
        var j = await res.json();
        if (j && j.ok && j.event) libUpsert(Object.assign({}, e, j.event), true);
      } catch (x) {}
    }));
    renderLib();
  }

  function openLib() {
    var m = $("evlib-modal");
    if (!m) return;
    if ($("event-modal")) closeEventModal();
    renderLib();
    m.classList.add("open");
    refreshLibStatuses();
  }
  function closeLib() { var m = $("evlib-modal"); if (m) m.classList.remove("open"); }
  window.openEventLibrary = openLib;
  window.closeEventLibrary = closeLib;

  // ======================================================================
  // 4. EVENT QR CODE GENERATOR
  // ======================================================================
  var qrCur = null;

  async function openEventQR(rec) {
    if (!rec || !rec.code) return;
    qrCur = rec;
    $("evqr-modal").classList.add("open");
    $("evqr-msg").textContent = "Making QR…";
    var url = inviteUrl(rec.code);
    var img = null;
    try { img = await loadQRForExport(url, 520); } catch (e) {}
    if (qrCur !== rec) return;

    var c = $("evqr-canvas"), W = 720, H = 900;
    c.width = W; c.height = H;
    var x = c.getContext("2d");
    var accent = (getComputedStyle(document.documentElement).getPropertyValue("--accent") || "#1d4ed8").trim();
    x.fillStyle = "#ffffff"; x.fillRect(0, 0, W, H);
    x.fillStyle = accent; x.fillRect(0, 0, W, 16);
    x.textAlign = "center"; x.textBaseline = "alphabetic";

    x.fillStyle = "#64748b"; x.font = "700 22px Inter, sans-serif";
    x.fillText("THE ARTcher · ARCHERSTUDIO", W / 2, 70);

    var name = rec.name || rec.code, fs = 54;
    x.fillStyle = "#0f172a";
    do { x.font = "900 " + fs + "px Inter, sans-serif"; fs -= 2; } while (x.measureText(name).width > W - 100 && fs > 24);
    if (x.measureText(name).width > W - 100) {
      while (name.length > 3 && x.measureText(name + "…").width > W - 100) name = name.slice(0, -1);
      name += "…";
    }
    x.fillText(name, W / 2, 150);

    var qs = 520, qx = (W - qs) / 2, qy = 190;
    x.strokeStyle = "#e2e8f0"; x.lineWidth = 3;
    x.beginPath(); x.roundRect(qx - 20, qy - 20, qs + 40, qs + 40, 24); x.stroke();
    if (img) {
      x.drawImage(img, qx, qy, qs, qs);
    } else {
      x.fillStyle = "#f1f5f9"; x.fillRect(qx, qy, qs, qs);
      x.fillStyle = "#64748b"; x.font = "600 24px Inter, sans-serif";
      x.fillText("QR unavailable offline", W / 2, qy + qs / 2);
    }

    x.fillStyle = "#0f172a"; x.font = "900 34px Inter, sans-serif";
    x.fillText("Scan to join", W / 2, qy + qs + 80);
    x.fillStyle = accent; x.font = '700 44px "JetBrains Mono", monospace';
    x.fillText(rec.code.split("").join(" "), W / 2, qy + qs + 140);
    x.fillStyle = "#64748b"; x.font = "600 20px Inter, sans-serif";
    x.fillText(entryEnded(rec) ? "Archived · view only" : fmtLeft(rec.endTs - Date.now()), W / 2, qy + qs + 180);

    $("evqr-msg").textContent = img ? "Scan to join · opens in the app if installed" : "Couldn't load the QR (offline?). Share the code instead.";
  }
  function closeEventQR() { $("evqr-modal").classList.remove("open"); qrCur = null; }
  window.openEventQR = openEventQR;

  async function qrForTypedCode() {
    var code = normCode($("evqr-code").value);
    if (code.length < 4) { showToast("Enter the event code."); return; }
    var rec = libGet().find(function (e) { return e.code === code; });
    if (!rec) {
      try {
        var res = await fetch(GAS_WEB_APP_URL + "?module=fwevent&code=" + code + "&_t=" + Date.now());
        var j = await res.json();
        if (!j.ok || !j.event) { showToast("No event with that code."); return; }
        rec = j.event;
      } catch (e) { showToast("Couldn't reach the server."); return; }
    }
    openEventQR(rec);
  }

  function copyQrLink() {
    if (!qrCur) return;
    var url = inviteUrl(qrCur.code);
    (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject())
      .then(function () { showToast("Invite link copied"); })
      .catch(function () { showToast("Share this code: " + qrCur.code); });
  }

  function shareQr() {
    if (!qrCur) return;
    var rec = qrCur;
    $("evqr-canvas").toBlob(async function (b) {
      var url = inviteUrl(rec.code);
      var text = "Join " + rec.name + " on THE ARTcher · code " + rec.code;
      try {
        if (b) {
          var f = new File([b], "artcher-event-" + rec.code + ".png", { type: "image/png" });
          if (navigator.canShare && navigator.canShare({ files: [f] })) {
            await navigator.share({ files: [f], title: rec.name, text: text, url: url });
            return;
          }
        }
        if (navigator.share) { await navigator.share({ title: rec.name, text: text, url: url }); return; }
      } catch (e) { if (e && e.name === "AbortError") return; }
      copyQrLink();
    }, "image/png");
  }

  function saveQr() {
    if (!qrCur) return;
    var code = qrCur.code;
    $("evqr-canvas").toBlob(function (b) {
      if (!b) { showToast("Could not create the PNG."); return; }
      downloadBlob(b, "artcher-event-" + code + ".png");
      showToast("QR saved ✓");
    }, "image/png");
  }

  // show the QR right after the user hosts a new event
  wrap("hostEvent", function (o) {
    return function () {
      var before = curEvent && curEvent.code;
      return Promise.resolve(o.apply(this, arguments)).then(function (r) {
        if (curEvent && curEvent.code !== before && hostToken(curEvent.code)) {
          closeEventModal();
          openEventQR(curEvent);
        }
        return r;
      });
    };
  });

  // ======================================================================
  // UI: modals + buttons (built from JS so no HTML anchors are needed)
  // ======================================================================
  function buildUI() {
    var lib = mk("div", "modal-backdrop"); lib.id = "evlib-modal";
    lib.onclick = function (e) { if (e.target === lib) closeLib(); };
    lib.innerHTML =
      '<div class="modal-box" role="dialog" aria-modal="true" aria-labelledby="evlib-title">' +
      '<div class="modal-head"><h3 id="evlib-title">Event library</h3><button type="button" class="btn btn-sm" id="evlib-close">Close</button></div>' +
      '<p class="evlib-sub">Events you joined or hosted. Archived events open read-only.</p>' +
      '<div class="evlib-list" id="evlib-list"></div></div>';
    document.body.appendChild(lib);
    $("evlib-close").onclick = closeLib;

    var qr = mk("div", "modal-backdrop"); qr.id = "evqr-modal";
    qr.onclick = function (e) { if (e.target === qr) closeEventQR(); };
    qr.innerHTML =
      '<div class="modal-box" role="dialog" aria-modal="true" aria-labelledby="evqr-title">' +
      '<div class="modal-head"><h3 id="evqr-title">Event QR code</h3><button type="button" class="btn btn-sm" id="evqr-close">Close</button></div>' +
      '<div class="evqr-wrap"><canvas id="evqr-canvas" width="720" height="900"></canvas></div>' +
      '<div class="cap-msg" id="evqr-msg"></div>' +
      '<div class="modal-actions"><button type="button" class="btn" id="evqr-copy">Copy link</button>' +
      '<button type="button" class="btn" id="evqr-share">Share</button>' +
      '<button type="button" class="btn btn-accent" id="evqr-save">Save PNG</button></div>' +
      '<div><div class="saved-label" style="margin-bottom:6px;">Make a QR for any code</div>' +
      '<div class="evqr-row"><input type="text" id="evqr-code" class="name-input" maxlength="8" placeholder="K7M2QX" autocomplete="off" autocapitalize="characters">' +
      '<button type="button" class="btn" id="evqr-go">Generate</button></div></div></div>';
    document.body.appendChild(qr);
    $("evqr-close").onclick = closeEventQR;
    $("evqr-copy").onclick = copyQrLink;
    $("evqr-share").onclick = shareQr;
    $("evqr-save").onclick = saveQr;
    $("evqr-go").onclick = qrForTypedCode;
    $("evqr-code").addEventListener("keydown", function (e) { if (e.key === "Enter") qrForTypedCode(); });
    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      if (qr.classList.contains("open")) closeEventQR();
      else if (lib.classList.contains("open")) closeLib();
    });

    // Event modal: QR button for the current event + library button
    var cur = $("event-current");
    var acts = cur && cur.querySelector(".modal-actions");
    if (acts) {
      var b = mk("button", "btn btn-sm", "QR code"); b.type = "button";
      b.onclick = function () { if (curEvent) openEventQR(curEvent); };
      acts.appendChild(b);
    }
    var box = $("event-modal") && $("event-modal").querySelector(".modal-box");
    if (box) {
      var lb = mk("button", "btn", "📚 Event library"); lb.type = "button";
      lb.onclick = openLib;
      var qb = mk("button", "btn", "QR code generator"); qb.type = "button";
      qb.onclick = function () { closeEventModal(); openEventQR(curEvent || { code: "------", name: "Enter a code below", endTs: 0, status: "archived" }); };
      var host = $("event-host");
      var wrapDiv = mk("div", "modal-actions");
      wrapDiv.append(lb, qb);
      box.insertBefore(wrapDiv, host || null);
    }

    // More tab: library row inside the Events card
    var cards = document.querySelectorAll("#view-more .card");
    for (var i = 0; i < cards.length; i++) {
      var h = cards[i].querySelector(".card-head");
      if (h && h.textContent.trim() === "Events") {
        var row = mk("button", "list-row"); row.type = "button";
        row.innerHTML =
          '<span class="lead"><svg viewBox="0 0 24 24"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>' +
          '<span>Event library<small id="evlib-more-sub">Events you join are saved here</small></span></span>';
        row.onclick = openLib;
        cards[i].appendChild(row);
        break;
      }
    }

    // Options: open-in-app switch
    var opt = $("opt-grid"), optCard = opt && opt.closest(".card");
    if (optCard) {
      var lab = mk("label", "list-row");
      lab.innerHTML = '<span>Open links in the app<small>Android: jump to ARTcher when it is installed</small></span>' +
        '<span class="switch"><input type="checkbox" id="opt-open-app"></span>';
      optCard.appendChild(lab);
      var cb = lab.querySelector("input");
      cb.checked = lsGet(LS_OPENAPP, true) !== false;
      cb.onchange = function () {
        lsSet(LS_OPENAPP, cb.checked);
        showToast(cb.checked ? "Links will open in the app" : "Links stay in the browser");
      };
    }
  }

  // ======================================================================
  // 5. OPEN IN THE ANDROID APP (com.artcher.app)
  // ======================================================================
  function inApp() {
    var ua = navigator.userAgent || "", p = new URLSearchParams(location.search);
    return typeof window.AndroidRadio !== "undefined" || typeof window.AndroidHaptic !== "undefined" ||
      /; wv\)/i.test(ua) || p.get("app") === "1" || p.get("source") === "apk" ||
      (document.referrer || "").indexOf("android-app://") === 0 ||
      (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches);
  }

  function intentUrl() {
    var fb = new URL(location.href);
    fb.searchParams.set("noapp", "1");      // fallback page must not retry (no loop)
    return "intent://" + location.host + location.pathname + location.search +
      "#Intent;scheme=" + location.protocol.replace(":", "") +
      ";package=" + APP_PKG +
      ";S.browser_fallback_url=" + encodeURIComponent(fb.href) + ";end";
  }

  function showAppBar() {
    try { if (sessionStorage.getItem(SS_BAR)) return; } catch (e) {}
    var bar = mk("div", "app-open-bar"); bar.setAttribute("role", "region");
    bar.setAttribute("aria-label", "Open in app");
    var t = mk("div", "aob-text");
    t.append(mk("strong", "", "Open in the ARTcher app"), mk("small", "", "Faster canvas, fullscreen and offline"));
    var go = mk("button", "btn btn-accent btn-sm", "Open"); go.type = "button";
    go.onclick = function () { location.href = intentUrl(); };       // a tap is a user gesture, Chrome allows it
    var x = mk("button", "btn btn-sm", "✕"); x.type = "button"; x.setAttribute("aria-label", "Dismiss");
    x.onclick = function () { bar.remove(); try { sessionStorage.setItem(SS_BAR, "1"); } catch (e) {} };
    bar.append(t, go, x);
    document.body.appendChild(bar);
  }

  async function initOpenInApp() {
    if (!/Android/i.test(navigator.userAgent) || inApp()) return;
    if (lsGet(LS_OPENAPP, true) === false) return;
    if (new URLSearchParams(location.search).get("noapp") === "1") return;

    // only works if the web manifest lists the app under related_applications
    try {
      if (navigator.getInstalledRelatedApps) {
        var apps = await navigator.getInstalledRelatedApps();
        if (apps.some(function (a) { return a.id === APP_PKG; })) {
          ["apk-prompt-card", "more-apk-card"].forEach(function (id) { var e = $(id); if (e) e.hidden = true; });
        }
      }
    } catch (e) {}

    showAppBar();
    try {
      if (!sessionStorage.getItem(SS_TRY)) {
        sessionStorage.setItem(SS_TRY, "1");
        location.replace(intentUrl());      // not installed -> Chrome opens the fallback URL (noapp=1)
      }
    } catch (e) {}
  }

  // ======================================================================
  // INIT
  // ======================================================================
  buildUI();
  if (curEvent) libUpsert(curEvent, true);
  renderLib();
  applyDrawLock();
  setInterval(applyDrawLock, 5000);
  initOpenInApp();
})();
"""


def main():
    path = Path(sys.argv[1] if len(sys.argv) > 1 else "freedomwall.html")
    if not path.is_file():
        sys.exit("File not found: %s" % path)

    html = path.read_text(encoding="utf-8")
    if "</head>" not in html or "</body>" not in html:
        sys.exit("This does not look like freedomwall.html (missing </head> or </body>).")

    shutil.copyfile(path, str(path) + ".bak")

    # remove an earlier run of this patch so the script can be re-run to update
    html = re.sub(r'<style id="artcher-events2">.*?</style>\n?', "", html, flags=re.S)
    html = re.sub(r'<script id="artcher-events2-js">.*?</script>\n?', "", html, flags=re.S)

    head_end = html.index("</head>")
    html = html[:head_end] + '<style id="artcher-events2">' + CSS + "</style>\n" + html[head_end:]

    body_end = html.rindex("</body>")
    html = html[:body_end] + '<script id="artcher-events2-js">' + JS + "</script>\n" + html[body_end:]

    path.write_text(html, encoding="utf-8")
    print("Patched %s (backup: %s.bak)" % (path, path))


if __name__ == "__main__":
    main()