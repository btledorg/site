#!/usr/bin/env python3
"""
update_wall.py - patches freedomwall.html (ARTcher) in place.

    python update_wall.py freedomwall.html            # apply / re-apply
    python update_wall.py freedomwall.html --remove   # strip the patch again
    python update_wall.py freedomwall.html --dry-run  # check anchors only
"""
import re
import shutil
import sys
from pathlib import Path

BEGIN = "<!--ARTCHER_PATCH_BEGIN v3-->"
END = "<!--ARTCHER_PATCH_END-->"

REQUIRED = [
    "function setScope", "function gasPost", "function joinEventByCode",
    "function openNicknameOverlay", "function handleStudioAuthorInput",
    "function shapeToStroke", "function pickShapeAt", "function applyShapeDrag",
    "function beginShapeDrag", "function updateShapeOverlay", "function focusTile",
    "function openModal", "function askConsent", "function applyEventUI",
]

SOURCE_PATCHES = [
    (
        r"const\s+sbClient\s*=\s*window\.supabase\.createClient\(",
        "const sbClient = window.sbClient = window.supabase.createClient(",
        "window.sbClient = window.supabase.createClient(",
    ),
]

BLOCK = BEGIN + r'''
<style id="artcher-update3-css">
/* ---------- bell + notification centre ---------- */
.notif-bell{position:relative;width:32px;height:32px;border-radius:50%;border:1px solid var(--border);background:var(--soft);display:inline-flex;align-items:center;justify-content:center;cursor:pointer;color:var(--ink);padding:0;flex-shrink:0}
.notif-bell:active{transform:scale(.94)}
.notif-bell svg{width:17px;height:17px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.notif-bell.ring svg{animation:ntRing .7s ease}
@keyframes ntRing{0%,100%{transform:rotate(0)}20%{transform:rotate(16deg)}40%{transform:rotate(-14deg)}60%{transform:rotate(9deg)}80%{transform:rotate(-6deg)}}
.notif-badge{position:absolute;top:-5px;right:-5px;min-width:16px;height:16px;padding:0 4px;border-radius:999px;background:#ef4444;color:#fff;font-size:10px;font-weight:800;display:flex;align-items:center;justify-content:center;border:2px solid #fff}
#notif-modal{z-index:210}
.nt-list{display:flex;flex-direction:column;max-height:min(58vh,440px);overflow-y:auto;border:1px solid var(--border);border-radius:12px}
.nt-row{display:flex;gap:10px;align-items:flex-start;padding:11px 12px;border-top:1px solid #f1f5f9;cursor:pointer;background:#fff;width:100%;text-align:left;border-left:0;border-right:0;border-bottom:0;font-family:inherit;color:var(--ink)}
.nt-row:first-child{border-top:0}
.nt-row.unread{background:var(--accent-soft)}
.nt-ico{font-size:20px;width:28px;text-align:center;flex-shrink:0}
.nt-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.nt-title{font-size:13.5px;font-weight:700;line-height:1.3}
.nt-body{font-size:12px;color:var(--muted);line-height:1.3}
.nt-time{font:600 10.5px 'JetBrains Mono',monospace;color:var(--muted);flex-shrink:0}
.nt-empty{padding:26px 16px;text-align:center;color:var(--muted);font-size:13.5px;font-weight:500}

/* ---------- scope switch (Main <-> Event) ---------- */
.scope-pop{position:fixed;z-index:240;width:min(300px,calc(100vw - 24px));max-height:55vh;overflow-y:auto;background:#fff;border:1px solid var(--border);border-radius:14px;box-shadow:0 12px 32px rgba(15,23,42,.22);padding:6px;display:flex;flex-direction:column;gap:2px}
.sp-row{display:flex;align-items:center;gap:10px;padding:10px 12px;border:0;background:#fff;border-radius:10px;font:600 13.5px 'Inter',sans-serif;color:var(--ink);cursor:pointer;text-align:left;width:100%}
.sp-row:hover,.sp-row:active{background:var(--soft)}
.sp-row.on{background:var(--accent-soft);color:var(--accent)}
.sp-row small{margin-left:auto;font:600 10.5px 'JetBrains Mono',monospace;color:var(--muted);white-space:nowrap}
.sp-h{font-size:10.5px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;padding:8px 12px 2px}
#view-wall#view-wall.curtain-closed .wall-hud>#scope-switch#scope-switch#scope-switch{display:inline-flex!important}
.post-scope{display:flex;gap:6px;flex-wrap:wrap}
.ps-btn{height:30px;padding:0 11px;border-radius:999px;border:1px solid var(--border);background:#fff;font:700 11.5px 'Inter',sans-serif;color:var(--ink);cursor:pointer;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ps-btn.on{background:var(--ink);color:#fff;border-color:var(--ink)}

/* ---------- auth form ---------- */
.auth-card{max-width:400px;text-align:left;gap:12px}
.auth-card .nickname-logo{margin:0 auto}
.auth-tabs{display:grid;grid-template-columns:repeat(3,1fr);gap:3px;padding:3px;background:var(--soft);border:1px solid var(--border);border-radius:12px}
.auth-tab{height:34px;border:0;border-radius:9px;background:transparent;color:var(--muted);font:700 12.5px 'Inter',sans-serif;cursor:pointer}
.auth-tab.active{background:var(--ink);color:#fff}
.auth-pane{display:none;flex-direction:column;gap:10px}
.auth-pane.active{display:flex}
.auth-lab{display:block;font-size:10.5px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;margin-bottom:3px}
.auth-lab opt{font-weight:500;text-transform:none;opacity:.8}
.auth-card label{display:block;min-width:0}
.auth-card .name-input{padding:10px 12px;font-size:14px}
.auth-msg{min-height:16px;font-size:12.5px;font-weight:600;color:var(--d-red);line-height:1.35}
.auth-msg.ok{color:var(--d-green)}
.auth-link{background:none;border:0;padding:0;color:var(--accent);font:700 12.5px 'Inter',sans-serif;cursor:pointer;text-align:left}
.auth-hp{position:absolute;left:-9999px;width:1px;height:1px;opacity:0}
.auth-note{font-size:11.5px;color:var(--muted);line-height:1.4}

/* ---------- shape rotation handle ---------- */
.shape-h.h-rot{background:var(--accent);color:#fff;border-color:#fff;cursor:grab;display:flex;align-items:center;justify-content:center;font-size:calc(11px / var(--zs));line-height:1;width:calc(22px / var(--zs));height:calc(22px / var(--zs));margin:calc(-11px / var(--zs)) 0 0 calc(-11px / var(--zs))}
.rot-quick{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}
</style>

<script id="artcher-update3-js">
(function () {
"use strict";
var $ = function (id) { return document.getElementById(id); };
var mk = function (t, c, x) { var e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
function wrap(name, make) { var o = window[name]; if (typeof o === "function") window[name] = make(o); }

var LS_NOTIFS = "fw_notifs_v3", LS_NPREFS = "fw_notif_prefs_v3", LS_NREAD = "fw_notif_read_v3",
    LS_NLAST = "fw_notif_last_v3", LS_DEV = "fw_device_v3", LS_JOINED = "fw_joined_v3", LS_LIB = "fw_event_library_v1";

var deviceId = lsGet(LS_DEV, null);
if (!deviceId) { deviceId = "d_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); lsSet(LS_DEV, deviceId); }

function hasPush() { return typeof window.AndroidPush !== "undefined" && window.AndroidPush !== null; }
function userKey() { return (userProfile && userProfile.userKey) || voterId; }
function myName() { return (userProfile && !userProfile.anonymous && userProfile.name) ? userProfile.name : ""; }
function gasGet(params) {
  var q = new URLSearchParams(Object.assign({ _t: Date.now() }, params));
  return fetch(GAS_WEB_APP_URL + "?" + q.toString()).then(function (r) { return r.json(); });
}

/* =====================================================================
0. tag outgoing posts with the user key
   ===================================================================== */
var _fetch = window.fetch;
window.fetch = function (input, init) {
  try {
    var url = typeof input === "string" ? input : ((input && input.url) || "");
    if (init && init.method === "POST" && typeof init.body === "string" && url.indexOf(GAS_WEB_APP_URL) === 0) {
      var b = JSON.parse(init.body), touched = true;
      if (b.action === "addFreedomWall") b.owner = userKey();
      else if (b.action === "reactFreedomWall") { b.by = userKey(); b.byName = myName(); }
      else if (b.action === "createFWEvent") b.owner = userKey();
      else touched = false;
      if (touched) init = Object.assign({}, init, { body: JSON.stringify(b) });
    }
  } catch (e) {}
  return _fetch.call(window, input, init);
};

/* =====================================================================
1. LOGIN / REGISTER / GUEST (Clean 5-field account)
   ===================================================================== */
function F(id, label, attrs) {
  return '<label><span class="auth-lab">' + label + '</span><input class="name-input" id="' + id + '" ' + (attrs || "") + '></label>';
}
var AUTH_HTML =
'<div class="nickname-overlay" id="auth-overlay" hidden role="dialog" aria-modal="true" aria-labelledby="auth-title"><div class="nickname-card auth-card">' +
  '<div class="nickname-logo"><img src="../resources/image/logo/logo4.png" alt="" onerror="this.style.display=\'none\'"><span>ARCHERSTUDIO</span></div>' +
  '<h2 class="nickname-title" id="auth-title" style="text-align:center">Welcome to THE ARTcher</h2>' +
  '<div class="auth-tabs" role="tablist"><button type="button" class="auth-tab" data-t="login">Log in</button><button type="button" class="auth-tab" data-t="register">Register</button><button type="button" class="auth-tab" data-t="guest">Guest</button></div>' +

  '<form class="auth-pane" id="auth-form-login" data-pane="login" autocomplete="on">' +
    F("al-id", "Username or Email", 'autocomplete="username" maxlength="80"') +
    F("al-pw", "Password", 'type="password" autocomplete="current-password" maxlength="64"') +
    '<div class="auth-msg" id="al-msg"></div>' +
    '<button type="submit" class="btn btn-accent btn-lg btn-block">Log in</button>' +
    '<button type="button" class="auth-link" data-go="reset">Forgot password?</button>' +
    '<div class="auth-note">Your account keeps your tiles and notifications on every device.</div>' +
  '</form>' +

  '<form class="auth-pane" id="auth-form-reset" data-pane="reset">' +
    '<div class="auth-note">Enter your account email and we will send a 6-digit reset code.</div>' +
    F("ar-email", "Email", 'type="email" maxlength="80"') +
    '<button type="button" class="btn btn-block" id="ar-send">Send verification code</button>' +
    '<div id="ar-code-wrap" hidden style="display:flex;flex-direction:column;gap:10px">' +
      F("ar-code", "6-digit code", 'inputmode="numeric" maxlength="6"') +
      F("ar-pw", "New password (6+)", 'type="password" autocomplete="new-password" maxlength="64"') +
    '</div>' +
    '<div class="auth-msg" id="ar-msg"></div>' +
    '<button type="submit" class="btn btn-accent btn-lg btn-block" id="ar-submit" hidden>Reset password &amp; log in</button>' +
    '<button type="button" class="auth-link" data-go="login">Back to log in</button>' +
  '</form>' +

  '<form class="auth-pane" id="auth-form-reg" data-pane="register" autocomplete="on">' +
    F("rg-name", "Full name", 'autocomplete="name" maxlength="60"') +
    F("rg-user", "Username", 'autocomplete="username" maxlength="24" placeholder="letters, numbers, _"') +
    F("rg-email", "Email", 'type="email" autocomplete="email" maxlength="80"') +
    F("rg-bday", "Birthday <opt>(optional)</opt>", 'type="date"') +
    F("rg-pw", "Password (6+ characters)", 'type="password" autocomplete="new-password" maxlength="64"') +
    '<input class="auth-hp" id="rg-web" tabindex="-1" autocomplete="off" aria-hidden="true">' +
    '<div class="auth-msg" id="rg-msg"></div>' +
    '<button type="submit" class="btn btn-accent btn-lg btn-block">Create account</button>' +
  '</form>' +

  '<form class="auth-pane" id="auth-form-guest" data-pane="guest">' +
    '<div class="auth-note">Guests can draw and post. Notifications are tied to this device only.</div>' +
    '<input type="text" id="ag-nick" class="name-input" maxlength="24" placeholder="Nickname" autocomplete="off">' +
    '<label class="anon-check-row" for="ag-anon"><input type="checkbox" id="ag-anon"><span>Or stay anonymous</span></label>' +
    '<div class="auth-msg" id="ag-msg"></div>' +
    '<button type="submit" class="btn btn-accent btn-lg btn-block">Continue as guest</button>' +
  '</form>' +
  '<button type="button" class="btn btn-block" id="auth-cancel" hidden>Cancel</button>' +
'</div></div>';

var authCancellable = false;
function authMsg(id, text, ok) { var m = $(id); if (m) { m.textContent = text || ""; m.classList.toggle("ok", !!ok); } }
function busy(form, on) {
  form.querySelectorAll("button,input,select").forEach(function (x) { x.disabled = on; });
  var s = form.querySelector('button[type="submit"]'); if (s) s.classList.toggle("is-busy", on);
}
function setTab(name) {
  document.querySelectorAll("#auth-overlay .auth-pane").forEach(function (p) { p.classList.toggle("active", p.dataset.pane === name); });
  document.querySelectorAll("#auth-overlay .auth-tab").forEach(function (t) { t.classList.toggle("active", t.dataset.t === name || (name === "reset" && t.dataset.t === "login")); });
}
function openAuth(tab, cancellable) {
  authCancellable = !!cancellable;
  $("auth-cancel").hidden = !cancellable;
  var g = $("ag-nick"), a = $("ag-anon");
  if (userProfile && !userProfile.account) { a.checked = !!userProfile.anonymous; g.value = userProfile.name || ""; g.disabled = a.checked; }
  setTab(tab || "login");
  $("auth-overlay").hidden = false;
}
function closeAuth() { $("auth-overlay").hidden = true; }

function applyAccount(p) {
  userProfile = {
    name: p.fullName || p.username || "Artist",
    username: p.username || "",
    email: p.email || "",
    anonymous: false,
    account: true,
    userKey: p.userKey
  };
  lsSet(LS_PROFILE, userProfile);
  applyProfileUI(); closeAuth(); haptic(12);
  showToast("Welcome, " + userProfile.name + "!");
  onKeyChanged();
}
function val(id) { return ($(id).value || "").trim(); }

function buildAuth() {
  document.body.insertAdjacentHTML("beforeend", AUTH_HTML);
  document.querySelectorAll("#auth-overlay .auth-tab").forEach(function (t) { t.onclick = function () { setTab(t.dataset.t); }; });
  document.querySelectorAll("#auth-overlay [data-go]").forEach(function (b) { b.onclick = function () { setTab(b.dataset.go); }; });
  $("auth-cancel").onclick = function () { if (authCancellable) closeAuth(); };
  $("ag-anon").onchange = function () { $("ag-nick").disabled = this.checked; };

  $("auth-form-login").onsubmit = function (e) {
    e.preventDefault();
    var f = this, id = val("al-id"), pw = $("al-pw").value;
    if (!id || !pw) return authMsg("al-msg", "Enter your username/email and password.");
    busy(f, true); authMsg("al-msg", "");
    window.gasPost({ action: "authLogin", login: id, password: pw, deviceKey: voterId }).then(function (j) {
      if (j && j.ok) applyAccount(j.profile);
      else authMsg("al-msg", (j && j.error) || "Login failed.");
    }).catch(function () { authMsg("al-msg", "Couldn't reach the server."); }).then(function () { busy(f, false); });
  };

  $("ar-send").onclick = function () {
    var b = this, email = val("ar-email");
    if (!email || email.indexOf("@") < 0) return authMsg("ar-msg", "Enter a valid email address.");
    b.disabled = true; authMsg("ar-msg", "");
    window.gasPost({ action: "authRequestCode", email: email }).then(function (j) {
      if (!j || !j.ok) return authMsg("ar-msg", (j && j.error) || "Couldn't send code.");
      $("ar-code-wrap").hidden = false;
      $("ar-submit").hidden = false;
      authMsg("ar-msg", "Code sent! Check your inbox (expires in 15 mins).", true);
    }).catch(function () { authMsg("ar-msg", "Couldn't reach the server."); }).then(function () { b.disabled = false; });
  };

  $("auth-form-reset").onsubmit = function (e) {
    e.preventDefault();
    var f = this, pw = $("ar-pw").value;
    if (pw.length < 6) return authMsg("ar-msg", "Password needs at least 6 characters.");
    busy(f, true);
    window.gasPost({ action: "authResetPassword", email: val("ar-email"), code: val("ar-code"), password: pw, deviceKey: voterId }).then(function (j) {
      if (j && j.ok) applyAccount(j.profile); else authMsg("ar-msg", (j && j.error) || "Couldn't reset password.");
    }).catch(function () { authMsg("ar-msg", "Couldn't reach the server."); }).then(function () { busy(f, false); });
  };

  $("auth-form-reg").onsubmit = function (e) {
    e.preventDefault();
    var f = this, pw = $("rg-pw").value;
    var body = {
      action: "authRegister",
      fullName: val("rg-name"),
      username: val("rg-user"),
      email: val("rg-email"),
      birthday: $("rg-bday").value,
      password: pw,
      website: val("rg-web"),
      deviceKey: voterId
    };
    if (!body.fullName || !body.username || !body.email) return authMsg("rg-msg", "Full name, username, and email are required.");
    if (!/^[a-zA-Z0-9_.-]{3,24}$/.test(body.username)) return authMsg("rg-msg", "Username must be 3–24 letters, numbers, or _ . -");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.email)) return authMsg("rg-msg", "That email address doesn't look right.");
    if (pw.length < 6) return authMsg("rg-msg", "Password needs at least 6 characters.");
    busy(f, true); authMsg("rg-msg", "");
    window.gasPost(body).then(function (j) {
      if (j && j.ok) applyAccount(j.profile); else authMsg("rg-msg", (j && j.error) || "Registration failed.");
    }).catch(function () { authMsg("rg-msg", "Couldn't reach the server."); }).then(function () { busy(f, false); });
  };

  $("auth-form-guest").onsubmit = function (e) {
    e.preventDefault();
    var anon = $("ag-anon").checked, nick = val("ag-nick").slice(0, 24);
    if (!anon && !nick) return authMsg("ag-msg", "Enter a nickname or tick stay anonymous.");
    var wasKey = userKey();
    userProfile = { name: anon ? "" : nick, anonymous: anon };
    lsSet(LS_PROFILE, userProfile); applyProfileUI(); closeAuth(); haptic(10);
    showToast(anon ? "Staying anonymous" : "Welcome, " + nick + "!");
    if (wasKey !== userKey()) onKeyChanged(); else registerDevice();
  };

  window.openNicknameOverlay = function (allowCancel) {
    if (userProfile && userProfile.account) { showToast("Your name comes from your account. Change the alias in the Post tab."); return; }
    openAuth("guest", !!allowCancel);
  };
  window.handleStudioAuthorInput = function (v) {
    var t = (v || "").trim().slice(0, 24);
    userProfile = Object.assign({}, userProfile || {}, { name: t, anonymous: !t });
    lsSet(LS_PROFILE, userProfile);
    var g = $("nav-greeting"), m = $("more-profile-name");
    if (g) { g.textContent = greetingFor(t); g.hidden = !g.textContent; }
    if (m) m.textContent = t || "Anonymous";
  };
}

function logout() {
  askConsent("Log out?", "You'll keep drawing as a guest. Account notifications stop on this device.", function () {
    var key = userKey();
    window.gasPost({ action: "fwUnregisterDevice", key: key, dev: deviceId }).catch(function () {});
    userProfile = { name: "", anonymous: true };
    lsSet(LS_PROFILE, userProfile); applyProfileUI(); onKeyChanged(); showToast("Logged out");
  }, { danger: true, okLabel: "Log out" });
}

function renderAccountCard() {
  var c = $("acct-card"); if (!c) return;
  var acc = userProfile && userProfile.account;
  c.querySelector("#acct-name").textContent = acc ? userProfile.name : (myName() || "Guest");
  c.querySelector("#acct-sub").textContent = acc ? "@" + userProfile.username + " • " + userProfile.email : "Log in to keep your tiles and alerts across devices";
  c.querySelector("#acct-btn").textContent = acc ? "Log out" : "Log in / Register";
}

/* =====================================================================
2. NOTIFICATIONS
   ===================================================================== */
var DEF_PREFS = { on: true, reactions: true, hostArt: true, eventUpdates: true, milestones: true, push: true };
function prefs() { return Object.assign({}, DEF_PREFS, lsGet(LS_NPREFS, {})); }
var notifs = [], readSet = new Set(), lastTs = 0, liveChan = null, liveKey = "";
function nk(s) { return s + ":" + userKey(); }
function loadState() { notifs = lsGet(nk(LS_NOTIFS), []); readSet = new Set(lsGet(nk(LS_NREAD), [])); lastTs = Number(lsGet(nk(LS_NLAST), 0)) || 0; }
function saveState() { lsSet(nk(LS_NOTIFS), notifs.slice(0, 80)); lsSet(nk(LS_NREAD), Array.from(readSet).slice(-300)); lsSet(nk(LS_NLAST), lastTs); }
function unread() { return notifs.filter(function (n) { return !readSet.has(n.id); }).length; }
function ago(ts) {
  var s = Math.max(1, Math.round((Date.now() - ts) / 1000)); if (s < 60) return "now";
  var m = Math.round(s / 60); if (m < 60) return m + "m"; var h = Math.round(m / 60); return h < 24 ? h + "h" : Math.round(h / 24) + "d";
}
var ICONS = { react: "💬", hostart: "🎨", milestone: "🏆", reveal: "🎭", ended: "📦", soon: "⏳", joined: "🎪", test: "🔔" };

function renderBadge() {
  var n = unread(), b = $("notif-badge"); if (!b) return;
  b.hidden = n === 0; b.textContent = n > 99 ? "99+" : String(n);
}
function renderList() {
  var list = $("notif-list"); if (!list) return;
  list.replaceChildren();
  if (!notifs.length) { list.appendChild(mk("div", "nt-empty", "Nothing yet. Likes, new art in your events and event updates show up here.")); return; }
  notifs.forEach(function (n) {
    var row = mk("button", "nt-row" + (readSet.has(n.id) ? "" : " unread")); row.type = "button";
    var main = mk("span", "nt-main"); main.append(mk("span", "nt-title", n.title || ""), mk("span", "nt-body", n.body || ""));
    row.append(mk("span", "nt-ico", n.icon || ICONS[n.type] || "🔔"), main, mk("span", "nt-time", ago(n.ts)));
    row.onclick = function () { openNotif(n); };
    list.appendChild(row);
  });
}
function osNotify(n) {
  try {
    if (hasPush() && window.AndroidPush.showLocal) { window.AndroidPush.showLocal(n.title || "ARTcher", n.body || "", JSON.stringify(n)); return; }
    if (document.hidden && "Notification" in window && Notification.permission === "granted") new Notification(n.title || "ARTcher", { body: n.body || "" });
  } catch (e) {}
}
function announce(n) {
  showToast(n.title || "New notification"); haptic([14, 40, 14]);
  var bell = $("notif-bell"); if (bell) { bell.classList.remove("ring"); void bell.offsetWidth; bell.classList.add("ring"); }
  osNotify(n);
}
function ingest(items, live, silent) {
  var fresh = [];
  items.forEach(function (n) {
    if (!n || !n.id || notifs.some(function (x) { return x.id === n.id; })) return;
    notifs.push(n); fresh.push(n); if (n.ts > lastTs) lastTs = n.ts;
  });
  if (!fresh.length) return;
  notifs.sort(function (a, b) { return b.ts - a.ts; }); notifs = notifs.slice(0, 80);
  if (silent) fresh.forEach(function (n) { readSet.add(n.id); });
  saveState(); renderBadge();
  if ($("notif-modal").classList.contains("open")) renderList();
  if (silent || prefs().on === false) return;
  if (live || fresh.length <= 3) fresh.slice(0, 3).forEach(announce);
  else showToast("🔔 " + fresh.length + " new notifications");
}
function pull() {
  if (!navigator.onLine) return Promise.resolve();
  var key = userKey(), first = lastTs === 0;
  return gasGet({ module: "fwnotifs", key: key, since: lastTs }).then(function (j) {
    if (j && j.ok && key === userKey()) ingest(j.items || [], false, first);
  }).catch(function () {});
}
function fallbackClient() {
  if (window.__fwnClient) return window.__fwnClient;
  if (window.supabase && SUPABASE_URL && SUPABASE_ANON_KEY) {
    window.__fwnClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return window.__fwnClient || null;
}
function connectLive() {
  var key = userKey(); if (liveChan && liveKey === key) return;
  var client = window.sbClient || fallbackClient(); if (!client) return;
  if (liveChan) { try { client.removeChannel(liveChan); } catch (e) {} liveChan = null; }
  liveKey = key;
  try {
    liveChan = client.channel("fwn:" + key, { config: { broadcast: { self: false } } });
    liveChan.on("broadcast", { event: "notif" }, function (m) { if (m && m.payload) ingest([m.payload], true); }).subscribe();
  } catch (e) {}
}
var regTimer = 0;
function registerDevice() {
  clearTimeout(regTimer);
  regTimer = setTimeout(function () {
    if (!navigator.onLine) return;
    var token = ""; try { if (hasPush() && window.AndroidPush.getToken) token = window.AndroidPush.getToken() || ""; } catch (e) {}
    window.gasPost({ action: "fwRegisterDevice", key: userKey(), dev: deviceId, token: token, platform: hasPush() ? "android" : "web", prefs: prefs(), name: myName() }).catch(function () {});
  }, 600);
}
window.onPushToken = function () { registerDevice(); };

function waitForEntry(id, ms) {
  return new Promise(function (res) {
    var t0 = Date.now();
    (function tick() {
      var e = wallEntries.find(function (x) { return x.id === id; });
      if (e) return res(e);
      if (Date.now() - t0 > ms) return res(null);
      setTimeout(tick, 250);
    })();
  });
}
function openNotif(n, fromPush) {
  if (fromPush) ingest([n], false, true);
  readSet.add(n.id); saveState(); renderBadge();
  $("notif-modal").classList.remove("open");
  var code = n.event || "", p = Promise.resolve();
  if (code !== evCode()) p = code ? switchScope(code) : switchScope("");
  p.then(function () {
    switchView("wall");
    if (!n.entryId) return;
    return waitForEntry(n.entryId, 7000).then(function (e) {
      if (!e) { showToast("Couldn't find that drawing. It may be hidden or removed."); return; }
      focusTile(e); setTimeout(function () { openModal(e); }, 750);
    });
  });
}
window.onNativeOpen = function (s) { try { var n = typeof s === "string" ? JSON.parse(s) : s; if (n && n.id) openNotif(n, true); } catch (e) {} };
function checkPendingOpen() {
  try { if (hasPush() && window.AndroidPush.consumePendingOpen) { var s = window.AndroidPush.consumePendingOpen(); if (s) window.onNativeOpen(s); } } catch (e) {}
}
function askPermission() {
  try {
    if (hasPush() && window.AndroidPush.requestPermission) window.AndroidPush.requestPermission();
    else if ("Notification" in window && Notification.permission === "default") Notification.requestPermission();
  } catch (e) {}
}
function fetchMine() {
  if (!(userProfile && userProfile.account)) return;
  gasGet({ module: "fwmine", key: userKey() }).then(function (j) {
    if (j && j.ok && Array.isArray(j.ids)) { myTileIds = Array.from(new Set(myTileIds.concat(j.ids))).slice(-50); lsSet(LS_MINE, myTileIds); }
  }).catch(function () {});
}
function joinServer(code) {
  var k = code + ":" + userKey(), m = lsGet(LS_JOINED, {}) || {};
  if (m[k]) return; m[k] = 1; lsSet(LS_JOINED, m);
  window.gasPost({ action: "fwJoinEvent", code: code, key: userKey() }).catch(function () { delete m[k]; lsSet(LS_JOINED, m); });
}

function buildNotifUI() {
  var bell = mk("button", "notif-bell"); bell.id = "notif-bell"; bell.type = "button"; bell.setAttribute("aria-label", "Notifications");
  bell.innerHTML = '<svg viewBox="0 0 24 24"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg><span class="notif-badge" id="notif-badge" hidden>0</span>';
  var cluster = document.querySelector(".topbar > div");
  if (cluster) cluster.insertBefore(bell, $("weather-pill") || cluster.firstChild);
  document.body.insertAdjacentHTML("beforeend",
    '<div class="modal-backdrop" id="notif-modal"><div class="modal-box" role="dialog" aria-modal="true" aria-labelledby="notif-title">' +
    '<div class="modal-head"><h3 id="notif-title">Notifications</h3><button type="button" class="btn btn-sm" id="notif-close">Close</button></div>' +
    '<div class="modal-actions"><button type="button" class="btn btn-sm" id="notif-readall">Mark all read</button><button type="button" class="btn btn-sm" id="notif-settings">Settings</button></div>' +
    '<div class="nt-list" id="notif-list"></div></div></div>');
  var modal = $("notif-modal");
  bell.onclick = function () { renderList(); modal.classList.add("open"); pull(); };
  modal.onclick = function (e) { if (e.target === modal) modal.classList.remove("open"); };
  $("notif-close").onclick = function () { modal.classList.remove("open"); };
  $("notif-readall").onclick = function () { notifs.forEach(function (n) { readSet.add(n.id); }); saveState(); renderBadge(); renderList(); };
  $("notif-settings").onclick = function () { modal.classList.remove("open"); switchView("more"); setTimeout(function () { var c = $("np-card"); if (c) c.scrollIntoView({ behavior: "smooth", block: "start" }); }, 250); };
}

function buildMoreCards() {
  var prof = $("more-profile-name") && $("more-profile-name").closest(".card");
  if (prof) {
    var acct = mk("div", "card"); acct.id = "acct-card";
    acct.innerHTML = '<div class="card-head">Account</div><div class="list-row" style="cursor:default"><span class="lead"><svg viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg><span><span id="acct-name">Guest</span><small id="acct-sub"></small></span></span><button type="button" class="btn btn-sm btn-primary" id="acct-btn">Log in</button></div>';
    prof.parentNode.insertBefore(acct, prof);
    $("acct-btn").onclick = function () { if (userProfile && userProfile.account) logout(); else openAuth("login", true); };
  }
  var opt = $("opt-grid") && $("opt-grid").closest(".card");
  if (!opt) return;
  function sw(id, t, s) { return '<label class="list-row"><span>' + t + '<small>' + s + '</small></span><span class="switch"><input type="checkbox" id="' + id + '"></span></label>'; }
  var card = mk("div", "card"); card.id = "np-card";
  card.innerHTML = '<div class="card-head">Notifications</div>' +
    sw("np-on", "Notifications", "Master switch for alerts") +
    sw("np-react", "Reactions on my art", "Hearts, stars and fire") +
    sw("np-host", "New art in events I host", "When someone posts to your event") +
    sw("np-event", "Event updates", "Reveal, ending soon, archived") +
    sw("np-mile", "Milestones", "When a drawing reaches 5, 10, 25 reactions…") +
    sw("np-push", "Push when the app is closed", hasPush() ? "Delivered through Firebase" : "Needs the Android app") +
    '<button type="button" class="list-row" id="np-test"><span class="lead"><svg viewBox="0 0 24 24"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg><span>Send a test notification<small>Checks live and push delivery</small></span></span></button>';
  opt.parentNode.insertBefore(card, opt);
  [["np-on", "on"], ["np-react", "reactions"], ["np-host", "hostArt"], ["np-event", "eventUpdates"], ["np-mile", "milestones"], ["np-push", "push"]].forEach(function (p) {
    var i = $(p[0]); i.checked = prefs()[p[1]] !== false;
    i.onchange = function () { var o = prefs(); o[p[1]] = i.checked; lsSet(LS_NPREFS, o); registerDevice(); if (i.checked && (p[1] === "on" || p[1] === "push")) askPermission(); };
  });
  $("np-test").onclick = function () {
    window.gasPost({ action: "fwTest", key: userKey() }).then(function (j) { showToast(j && j.ok ? "Test sent. It should arrive in a second." : ((j && j.error) || "Test failed.")); }).catch(function () { showToast("Couldn't reach the server."); });
  };
}

/* =====================================================================
3. MAIN <-> EVENT QUICK SWITCH
   ===================================================================== */
function libList() { var a = lsGet(LS_LIB, []); return Array.isArray(a) ? a : []; }
function ended(e) { return e.status !== "active" || Date.now() >= (e.endTs || 0); }
function switchScope(code) {
  closeScopePop();
  if (!code) { if (curEvent) { setScope(null); showToast("Main wall"); } return Promise.resolve(); }
  if (curEvent && curEvent.code === code) return Promise.resolve();
  return joinEventByCode(code).then(function (ok) {
    if (!ok) { var rec = libList().find(function (e) { return e.code === code; }); if (rec) setScope(rec); }
  });
}
function updateScopeUI() {
  var b = $("scope-switch");
  if (b) b.textContent = curEvent ? "🎪 " + curEvent.name.slice(0, 12) + " ▾" : "🏠 Main ▾";
  renderPostScope();
}
function renderPostScope() {
  var seg = $("post-scope"); if (!seg) return;
  seg.replaceChildren();
  function add(label, code, on) { var b = mk("button", "ps-btn" + (on ? " on" : ""), label); b.type = "button"; b.onclick = function () { switchScope(code); }; seg.appendChild(b); }
  add("🏠 Main wall", "", !curEvent);
  var live = libList().filter(function (e) { return !ended(e); });
  if (curEvent && !live.some(function (e) { return e.code === curEvent.code; })) live.unshift(curEvent);
  live.slice(0, 3).forEach(function (e) { add("🎪 " + (e.name || e.code).slice(0, 16), e.code, !!curEvent && curEvent.code === e.code); });
}
var scopePop = null;
function closeScopePop() { if (scopePop) { scopePop.remove(); scopePop = null; } }
function toggleScopePop() {
  if (scopePop) return closeScopePop();
  var btn = $("scope-switch"), r = btn.getBoundingClientRect();
  scopePop = mk("div", "scope-pop");
  scopePop.style.left = Math.max(8, Math.min(r.left, window.innerWidth - 308)) + "px";
  scopePop.style.top = (r.bottom + 6) + "px";
  function row(label, code, on, meta) {
    var b = mk("button", "sp-row" + (on ? " on" : ""), label); b.type = "button";
    if (meta) b.appendChild(mk("small", "", meta));
    b.onclick = function () { haptic(8); switchScope(code); }; scopePop.appendChild(b);
  }
  scopePop.appendChild(mk("div", "sp-h", "Wall"));
  row("🏠 Main wall", "", !curEvent, "");
  var lib = libList(), live = lib.filter(function (e) { return !ended(e); }), done = lib.filter(ended);
  if (curEvent && !lib.some(function (e) { return e.code === curEvent.code; })) live.unshift(curEvent);
  if (live.length) { scopePop.appendChild(mk("div", "sp-h", "Live events")); live.forEach(function (e) { row("🎪 " + e.name, e.code, !!curEvent && curEvent.code === e.code, fmtLeft((e.endTs || 0) - Date.now())); }); }
  if (done.length) { scopePop.appendChild(mk("div", "sp-h", "Archive")); done.slice(0, 6).forEach(function (e) { row("📦 " + e.name, e.code, !!curEvent && curEvent.code === e.code, e.code); }); }
  var j = mk("button", "sp-row", "➕ Join with a code…"); j.type = "button"; j.onclick = function () { closeScopePop(); openEventModal(); }; scopePop.appendChild(j);
  document.body.appendChild(scopePop);
}
document.addEventListener("pointerdown", function (e) { if (scopePop && !e.target.closest(".scope-pop, #scope-switch")) closeScopePop(); });

function buildScopeUI() {
  var hud = document.querySelector("#view-wall .wall-hud"), evb = $("event-btn");
  if (hud) {
    var sw = mk("button", "btn btn-secondary"); sw.id = "scope-switch"; sw.type = "button"; sw.onclick = toggleScopePop;
    hud.insertBefore(sw, evb || null);
  }
  var note = $("event-post-note");
  if (note) { var seg = mk("div", "post-scope"); seg.id = "post-scope"; note.after(seg); }
  var acts = document.querySelector("#event-current .modal-actions");
  if (acts) {
    var m = mk("button", "btn btn-sm", "Main wall"); m.type = "button";
    m.onclick = function () { closeEventModal(); switchScope(""); };
    acts.appendChild(m);
  }
  wrap("setScope", function (o) { return function (ev) {
    var r = o.apply(this, arguments);
    try { if (ev && ev.code && ev.status !== "archived") joinServer(ev.code); } catch (e) {}
    updateScopeUI(); return r;
  }; });
  wrap("applyEventUI", function (o) { return function () { var r = o.apply(this, arguments); try { updateScopeUI(); } catch (e) {} return r; }; });
  updateScopeUI();
}

/* =====================================================================
4. SHAPE ROTATION (any angle, 0-360)
   ===================================================================== */
function rotPt(x, y, cx, cy, deg) {
  var a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), dx = x - cx, dy = y - cy;
  return [cx + dx * c - dy * s, cy + dx * s + dy * c];
}
window.shapeToStroke = function (sh) {
  var p = buildShapePoints(sh.kind, [sh.x0, sh.y0], [sh.x1, sh.y1], false), r = sh.r || 0;
  if (r && sh.kind !== "line") {
    var cx = (sh.x0 + sh.x1) / 2, cy = (sh.y0 + sh.y1) / 2;
    p = p.map(function (q) { var o = rotPt(q[0], q[1], cx, cy, r); return [Math.round(o[0]), Math.round(o[1])]; });
  }
  return { c: sh.c, s: sh.s, a: sh.a, sm: false, fl: !!sh.fl && sh.kind !== "line", p: p };
};
window.pickShapeAt = function (pt) {
  var TOL = 10;
  for (var i = layers.length - 1; i >= 0; i--) {
    var lyr = layers[i]; if (!lyr.shape || !lyr.visible) continue;
    var s = lyr.shape, b = shapeBounds(s), q = pt;
    if (s.r && s.kind !== "line") q = rotPt(pt[0], pt[1], (s.x0 + s.x1) / 2, (s.y0 + s.y1) / 2, -s.r);
    var hit = s.kind === "line" ? distToSegment(pt, [s.x0, s.y0], [s.x1, s.y1]) <= TOL
      : q[0] >= b.L - TOL && q[0] <= b.R + TOL && q[1] >= b.T - TOL && q[1] <= b.B + TOL;
    if (hit) { selectShape(lyr.id); return; }
  }
  selectShape(null);
};
window.updateShapeOverlay = function () {
  if (!shapeEd) return;
  shapeEd.style.setProperty("--zs", String(studioScale || 1));
  var lyr = selectedShape();
  if (!lyr || !lyr.visible || previewHidden || isPreviewing) { shapeEd.hidden = true; syncRotUI(); return; }
  var s = lyr.shape, b = shapeBounds(s), isLine = s.kind === "line", rot = isLine ? 0 : (s.r || 0);
  var cx = (b.L + b.R) / 2, cy = (b.T + b.B) / 2, w = b.R - b.L, h = b.B - b.T;
  var pct = function (v) { return (v / 5) + "%"; };
  var put = function (el, x, y) { el.style.left = pct(clamp(x, 6, 494)); el.style.top = pct(clamp(y, 6, 494)); };
  var putR = function (el, x, y) { var q = rotPt(x, y, cx, cy, rot); put(el, q[0], q[1]); };
  shapeEd.hidden = false;
  Object.assign(shapeEd.box.style, { left: pct(b.L), top: pct(b.T), width: pct(w), height: pct(h), transformOrigin: "50% 50%", transform: rot ? "rotate(" + rot + "deg)" : "" });
  SHAPE_RESIZE_HANDLES.forEach(function (k) {
    var el = shapeEd.handles[k]; el.hidden = isLine;
    if (!isLine) putR(el, b.L + SHAPE_HANDLE_POS[k][0] * w, b.T + SHAPE_HANDLE_POS[k][1] * h);
  });
  shapeEd.handles.p0.hidden = !isLine; shapeEd.handles.p1.hidden = !isLine;
  if (isLine) { put(shapeEd.handles.p0, s.x0, s.y0); put(shapeEd.handles.p1, s.x1, s.y1); }
  var small = w < 70 || h < 70;
  if (small) putR(shapeEd.handles.move, cx, b.B + 18); else put(shapeEd.handles.move, cx, cy);
  var rh = shapeEd.handles.rot;
  if (rh) { rh.hidden = isLine; if (!isLine) putR(rh, cx, b.T < 44 ? b.B + (small ? 42 : 34) : b.T - 30); }
  syncRotUI();
};
window.applyShapeDrag = function (pt) {
  var d = shapeDrag, s = d.lyr.shape, o = d.orig, k = d.key, L = d.box.L, R = d.box.R, T = d.box.T, B = d.box.B, MIN = 6;
  var r0 = d.r0 || 0, cx0 = (L + R) / 2, cy0 = (T + B) / 2;
  if (k === "move") {
    var dx = clamp(pt[0] - d.start[0], -L, 500 - R), dy = clamp(pt[1] - d.start[1], -T, 500 - B);
    s.x0 = o.x0 + dx; s.x1 = o.x1 + dx; s.y0 = o.y0 + dy; s.y1 = o.y1 + dy;
  } else if (k === "rot") {
    var a = Math.atan2(pt[1] - cy0, pt[0] - cx0) * 180 / Math.PI + 90;
    if (shapeLock || shiftPressed) a = Math.round(a / 15) * 15;
    else { var n = Math.round(a / 45) * 45; if (Math.abs(a - n) < 3) a = n; }
    s.r = ((Math.round(a) % 360) + 360) % 360;
  } else if (k === "p0" || k === "p1") {
    var p = pt, fixed = k === "p0" ? [o.x1, o.y1] : [o.x0, o.y0];
    if (shapeLock || shiftPressed) { var sn = shapeBoxFromDrag("line", fixed, pt, true); p = [sn.x1, sn.y1]; }
    if (k === "p0") { s.x0 = p[0]; s.y0 = p[1]; } else { s.x1 = p[0]; s.y1 = p[1]; }
  } else {
    var q = r0 ? rotPt(pt[0], pt[1], cx0, cy0, -r0) : pt;
    var l = L, rt = R, t = T, bt = B;
    if (k.indexOf("w") > -1) l = Math.min(q[0], R - MIN);
    if (k.indexOf("e") > -1) rt = Math.max(q[0], L + MIN);
    if (k.indexOf("n") > -1) t = Math.min(q[1], B - MIN);
    if (k.indexOf("s") > -1) bt = Math.max(q[1], T + MIN);
    if (k.length === 2 && (shapeLock || shiftPressed)) {
      var ratio = (R - L) / Math.max(1, B - T), hh = Math.max(MIN, (rt - l) / ratio);
      if (k.indexOf("n") > -1) t = bt - hh; else bt = t + hh;
    }
    var wc = rotPt((l + rt) / 2, (t + bt) / 2, cx0, cy0, r0);
    var hw = (rt - l) / 2, hh2 = (bt - t) / 2;
    s.x0 = wc[0] - hw; s.x1 = wc[0] + hw; s.y0 = wc[1] - hh2; s.y1 = wc[1] + hh2;
  }
  s.x0 = Math.round(s.x0); s.y0 = Math.round(s.y0); s.x1 = Math.round(s.x1); s.y1 = Math.round(s.y1);
  commitShapeEdit(d.lyr);
};
function syncRotUI() {
  var l = selectedShape(), show = !!l && l.shape.kind !== "line";
  var row = $("shape-rot-row"), q = $("shape-rot-quick"); if (row) row.hidden = !show; if (q) q.hidden = !show;
  if (show) { var r = Math.round(l.shape.r || 0) % 360; $("shape-rot-slider").value = r; $("shape-rot-val").textContent = r + "°"; }
}
function setRot(deg) {
  var l = selectedShape(); if (!l || l.shape.kind === "line") return;
  l.shape.r = ((Math.round(deg) % 360) + 360) % 360;
  commitShapeEdit(l); syncRotUI();
}
function buildShapeRotation() {
  wrap("beginShapeDrag", function (o) { return function (e, key) { o.apply(this, arguments); if (shapeDrag) shapeDrag.r0 = shapeDrag.lyr.shape.r || 0; }; });
  if (shapeEd && !shapeEd.handles.rot) {
    var h = mk("button", "shape-h h-rot", "↻"); h.type = "button"; h.setAttribute("aria-label", "Rotate shape");
    h.addEventListener("pointerdown", function (e) { window.beginShapeDrag(e, "rot"); });
    h.addEventListener("touchstart", function (e) { e.stopPropagation(); }, { passive: true });
    shapeEd.appendChild(h); shapeEd.handles.rot = h;
  }
  var anchor = $("shape-sel-row");
  if (anchor) {
    var row = mk("div", "slider-row"); row.id = "shape-rot-row"; row.hidden = true;
    row.innerHTML = '<span>Rotate</span><input type="range" id="shape-rot-slider" min="0" max="360" step="1" value="0"><span class="slider-val" id="shape-rot-val">0°</span>';
    var quick = mk("div", "rot-quick"); quick.id = "shape-rot-quick"; quick.hidden = true;
    [["−15°", -15], ["+15°", 15], ["90°", 90], ["Reset", 0]].forEach(function (p) {
      var b = mk("button", "btn btn-sm", p[0]); b.type = "button";
      b.onclick = function () { var l = selectedShape(); if (!l) return; setRot(p[0] === "Reset" ? 0 : p[0] === "90°" ? (l.shape.r || 0) + 90 : (l.shape.r || 0) + p[1]); };
      quick.appendChild(b);
    });
    anchor.after(row); row.after(quick);
    $("shape-rot-slider").oninput = function () { setRot(Number(this.value)); };
  }
  syncRotUI();
}

/* =====================================================================
   BOOT
   ===================================================================== */
function onKeyChanged() {
  loadState(); renderBadge(); connectLive(); pull(); registerDevice(); fetchMine(); renderAccountCard(); renderPostScope();
}
function boot() {
  buildAuth(); buildNotifUI(); buildMoreCards(); buildScopeUI(); buildShapeRotation();
  if (!userProfile) { var old = $("nickname-overlay"); if (old) old.hidden = true; openAuth("login", false); }
  onKeyChanged();
  setInterval(function () { if (!document.hidden) pull(); }, 45000);
  document.addEventListener("visibilitychange", function () { if (!document.hidden) { pull(); checkPendingOpen(); } });
  window.addEventListener("online", function () { pull(); registerDevice(); });
  checkPendingOpen();
}
boot();
})();
</script>
''' + END


def strip_block(html: str) -> str:
    return re.sub(re.escape(BEGIN) + r".*?" + re.escape(END) + r"\n?", lambda m: "", html, flags=re.S)


def main() -> int:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    flags = {a for a in sys.argv[1:] if a.startswith("--")}
    if not args:
        print(__doc__)
        return 1

    path = Path(args[0])
    if not path.is_file():
        print(f"error: {path} not found")
        return 1

    html = path.read_text(encoding="utf-8")
    had_block = BEGIN in html
    html = strip_block(html)

    missing = [r for r in REQUIRED if r not in html]
    if missing:
        print("error: this does not look like the ARTcher freedomwall.html. Missing:")
        for m in missing:
            print("   -", m)
        return 1

    if "--remove" in flags:
        if "--dry-run" not in flags:
            path.write_text(html, encoding="utf-8")
        print("patch block removed" if had_block else "nothing to remove")
        return 0

    for pattern, repl, marker in SOURCE_PATCHES:
        if marker in html:
            print("  ok   already applied:", marker[:48])
        elif re.search(pattern, html):
            html = re.sub(pattern, lambda m: repl, html, count=1)
            print("  ok   patched:", marker[:48])
        else:
            print("  WARN anchor not found, falling back to a 2nd socket:", pattern[:48])

    idx = html.rfind("</body>")
    if idx == -1:
        print("error: </body> not found")
        return 1
    html = html[:idx] + BLOCK + "\n" + html[idx:]

    if "--dry-run" in flags:
        print("dry run OK, nothing written")
        return 0

    bak = path.with_name(path.name + ".bak")
    if not bak.exists():
        shutil.copy2(path, bak)
        print(f"  backup: {bak}")
    path.write_text(html, encoding="utf-8")
    print(f"{'updated' if had_block else 'patched'} {path} ({len(html) // 1024} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())