#!/usr/bin/env python3
"""
patch_freedom.py  -  revises freedom.js

  1. Studio canvas: free pan (left/right/up/down) + zoom toward the touch/cursor point
  2. Teams: live chat overlay (open/close from a Chat button in the tool dock) for the
     shared-room session, with delivery retry + history sync

Usage:   python3 patch_freedom.py freedom.js
Output:  freedom.js is updated in place; the original is saved as freedom.js.bak
"""
import re, shutil, sys

def flex(anchor):
    """Regex for `anchor` that ignores differences in whitespace/indentation."""
    return r"\s+".join(re.escape(t) for t in anchor.split())

def patch(src, anchor, repl, label):
    rx = re.compile(flex(anchor))
    hits = rx.findall(src)
    if len(hits) != 1:
        sys.exit(f"[FAIL] {label}: anchor found {len(hits)} times (expected 1). Nothing written.")
    print(f"[ ok ] {label}")
    return rx.sub(lambda m: repl, src, count=1)

# ----------------------------------------------------------------------------
# 1. ZOOM / PAN FIX
#    The old clamp only allowed pan values <= 0 (assumed a top-left origin) but the
#    stage rotates/scales around its CENTRE, so any move right/down - and any zoom
#    anchored away from the centre - was clamped back to 0.
# ----------------------------------------------------------------------------
PAN_OLD = """const minX = w - extentX; const minY = h - extentY;
studioPanX = Math.min(0, Math.max(minX, studioPanX));
studioPanY = Math.min(0, Math.max(minY, studioPanY));"""
PAN_NEW = """// stage pivots on its centre -> allowed pan is symmetric (+/-). Keep >= 80px of canvas on screen.
const keepVisible = 80;
const limX = Math.max(0, (extentX + w) / 2 - keepVisible);
const limY = Math.max(0, (extentY + h) / 2 - keepVisible);
studioPanX = Math.min(limX, Math.max(-limX, studioPanX));
studioPanY = Math.min(limY, Math.max(-limY, studioPanY));"""

APPLY_OLD = """if (Math.abs(studioScale - 1) <= 0.001 && Math.abs(studioRotation % 360) < 0.001) {
studioScale = 1; studioPanX = 0; studioPanY = 0; } else { clampStudioPan(); }"""
APPLY_NEW = """if (Math.abs(studioScale - 1) <= 0.001) studioScale = 1;
clampStudioPan();   // pan stays free at 100% too; tap the zoom % label to recentre"""

# ----------------------------------------------------------------------------
# 2. TEAM CHAT
# ----------------------------------------------------------------------------
CHAT_JS = r"""
// =========================================================================
// TEAM CHAT (shared-room session) - floating overlay opened from the tool dock
//  - every message has a unique id -> de-duplicated on both sides
//  - failed sends are retried automatically until delivered
//  - a "chat-sync" heartbeat lists the ids each side has; whoever has messages
//    the other lacks pushes them ("chat-history"), so late joiners and dropped
//    packets always converge.
// =========================================================================
var collabChat = [];
var collabChatIds = new Set();
var collabChatUnread = 0;
var collabChatTimer = null;
var collabChatLastSentAt = 0;
var COLLAB_CHAT_MAX = 200;
var COLLAB_CHAT_LEN = 300;

function collabChatInjectStyle() {
    if (document.getElementById("collab-chat-style")) return;
    const s = document.createElement("style");
    s.id = "collab-chat-style";
    s.textContent =
    "#collab-chat-overlay{position:fixed;right:12px;bottom:calc(84px + env(safe-area-inset-bottom,0px));width:min(340px,calc(100vw - 24px));z-index:700;display:flex;flex-direction:column;gap:8px;padding:10px;border-radius:16px;border:1px solid #e2e8f0;background:#fff;color:#0f172a;box-shadow:0 18px 40px rgba(15,23,42,.28);animation:ccIn .16s ease-out}" +
    "#collab-chat-overlay[hidden]{display:none}" +
    "@keyframes ccIn{from{opacity:0;transform:translateY(8px) scale(.98)}to{opacity:1;transform:none}}" +
    ".cc-head{display:flex;align-items:center;gap:8px;font-weight:800;font-size:13px}" +
    ".cc-head>span:first-child{flex:1}" +
    ".cc-live{font-size:11px;font-weight:700;color:#16a34a}.cc-live.off{color:#dc2626}" +
    ".cc-x{border:0;background:#f1f5f9;color:#334155;width:26px;height:26px;border-radius:50%;cursor:pointer;font-size:13px;line-height:1}" +
    "#collab-chat-list{display:flex;flex-direction:column;gap:6px;height:min(240px,40vh);overflow-y:auto;padding:2px}" +
    ".cc-empty{margin:auto;font-size:12px;color:#64748b;text-align:center}" +
    ".cc-msg{max-width:84%;padding:6px 10px;border-radius:12px;font-size:13px;line-height:1.35;word-break:break-word;background:#f1f5f9;color:#0f172a;align-self:flex-start}" +
    ".cc-msg.me{align-self:flex-end;background:var(--accent,#1d4ed8);color:#fff}" +
    ".cc-msg b{display:block;font-size:10.5px;opacity:.7;margin-bottom:1px}" +
    ".cc-msg small{display:block;font-size:10px;opacity:.7;text-align:right}" +
    ".cc-msg.failed{outline:2px solid #dc2626;cursor:pointer}" +
    "#collab-chat-form{display:flex;gap:6px}" +
    "#collab-chat-input{flex:1;min-width:0}" +
    ".collab-chat-tool{position:relative}" +
    ".collab-chat-tool.chat-on{background:var(--accent-soft,#eff6ff);color:var(--accent,#1d4ed8)}" +
    ".collab-chat-tool.no-room{opacity:.55}" +
    ".collab-chat-tool.cc-fab{position:fixed;right:12px;bottom:calc(84px + env(safe-area-inset-bottom,0px));z-index:650;width:46px;height:46px;border-radius:50%;border:1px solid #e2e8f0;background:#fff;box-shadow:0 6px 16px rgba(15,23,42,.2)}" +
    ".collab-chat-dot{position:absolute;top:-3px;right:-3px;min-width:16px;height:16px;line-height:16px;padding:0 4px;border-radius:99px;background:#dc2626;color:#fff;font-size:10px;font-weight:800;text-align:center}" +
    ".collab-chat-dot[hidden]{display:none}";
    document.head.appendChild(s);
}

var COLLAB_CHAT_ICON = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';

function collabChatEnsureUI() {
    if (document.getElementById("collab-chat-overlay")) return true;
    if (!document.body) return false;
    collabChatInjectStyle();

    const overlay = document.createElement("div");
    overlay.id = "collab-chat-overlay";
    overlay.hidden = true;
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-label", "Team chat");
    overlay.innerHTML =
        '<div class="cc-head"><span>💬 Team chat</span><span class="cc-live" id="collab-chat-live">Live</span>' +
        '<button type="button" class="cc-x" id="collab-chat-close" aria-label="Close chat">✕</button></div>' +
        '<div id="collab-chat-list" role="log" aria-live="polite"></div>' +
        '<form id="collab-chat-form" autocomplete="off">' +
        '<input class="name-input" id="collab-chat-input" type="text" maxlength="' + COLLAB_CHAT_LEN + '" placeholder="Message your teammate…" enterkeyhint="send">' +
        '<button type="submit" class="btn btn-accent btn-sm">Send</button></form>';
    document.body.appendChild(overlay);
    overlay.querySelector("#collab-chat-close").addEventListener("click", () => collabChatClose());
    overlay.querySelector("form").addEventListener("submit", e => {
        e.preventDefault();
        const input = document.getElementById("collab-chat-input");
        if (collabChatSend(input.value)) input.value = "";
        input.focus();
    });
    document.addEventListener("keydown", e => {
        if (e.key === "Escape" && collabChatIsOpen()) collabChatClose();
    });

    // Chat button inside the tool dock (floating button if the dock isn't found)
    const dock = document.querySelector(".tool-dock");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = "collab-chat-tool";
    btn.className = "tool-btn collab-chat-tool no-room" + (dock ? "" : " cc-fab");
    btn.title = "Team chat";
    btn.setAttribute("aria-label", "Team chat");
    btn.innerHTML = COLLAB_CHAT_ICON + (dock ? "<span>Chat</span>" : "") + '<span class="collab-chat-dot" hidden></span>';
    btn.addEventListener("click", collabChatToggle);
    (dock || document.body).appendChild(btn);

    // shortcut button inside the Team tab
    const pane = document.getElementById("pane-team");
    if (pane) {
        const pb = document.createElement("button");
        pb.type = "button";
        pb.id = "collab-chat-pane-btn";
        pb.className = "btn btn-sm";
        pb.style.marginTop = "10px";
        pb.hidden = true;
        pb.textContent = "💬 Open team chat";
        pb.addEventListener("click", collabChatOpen);
        pane.appendChild(pb);
    }
    return true;
}

function collabChatIsOpen() {
    const o = document.getElementById("collab-chat-overlay");
    return !!o && !o.hidden;
}

function collabChatOpen() {
    if (!collabChannel) { showToast("Start or join a team room in Teams to chat"); return; }
    if (!collabChatEnsureUI()) return;
    document.getElementById("collab-chat-overlay").hidden = false;
    const tb = document.getElementById("collab-chat-tool");
    if (tb) tb.classList.add("chat-on");
    collabChatUnread = 0;
    collabChatSyncVisibility();
    collabChatRender();
    const list = document.getElementById("collab-chat-list");
    if (list) list.scrollTop = list.scrollHeight;
    if (window.matchMedia && window.matchMedia("(pointer: fine)").matches) {
        setTimeout(() => { const i = document.getElementById("collab-chat-input"); if (i) i.focus(); }, 30);
    }
    haptic(6);
}

function collabChatClose() {
    const o = document.getElementById("collab-chat-overlay");
    if (o) o.hidden = true;
    const tb = document.getElementById("collab-chat-tool");
    if (tb) tb.classList.remove("chat-on");
}

function collabChatToggle() {
    if (collabChatIsOpen()) collabChatClose(); else collabChatOpen();
}

function collabChatSyncVisibility() {
    if (!collabChatEnsureUI()) return;
    const inRoom = !!collabChannel;
    const ok = inRoom && collabChannel.state === "joined";
    const live = document.getElementById("collab-chat-live");
    if (live) {
        live.textContent = ok ? "Live" : "Reconnecting…";
        live.classList.toggle("off", !ok);
    }
    const tb = document.getElementById("collab-chat-tool");
    if (tb) tb.classList.toggle("no-room", !inRoom);
    const pb = document.getElementById("collab-chat-pane-btn");
    if (pb) pb.hidden = !inRoom;
    if (!inRoom) collabChatClose();
}

function collabChatRender() {
    const list = document.getElementById("collab-chat-list");
    if (list) {
        const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 60;
        list.replaceChildren();
        if (!collabChat.length) {
            const empty = document.createElement("div");
            empty.className = "cc-empty";
            empty.textContent = "No messages yet. Say hi 👋";
            list.appendChild(empty);
        }
        collabChat.forEach(m => {
            const mine = m.peerId === collabSelfKey;
            const row = document.createElement("div");
            row.className = "cc-msg" + (mine ? " me" : "") + (m.status === "failed" ? " failed" : "");
            if (!mine) {
                const who = document.createElement("b");
                who.textContent = m.name || "Artist";
                row.appendChild(who);
            }
            row.appendChild(document.createTextNode(m.text));
            const meta = document.createElement("small");
            const t = new Date(m.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
            meta.textContent = mine && m.status === "sending" ? "sending…" : mine && m.status === "failed" ? "not sent · tap to retry" : t;
            row.appendChild(meta);
            if (m.status === "failed") row.onclick = () => { m.status = "sending"; collabChatRender(); collabChatDeliver(m); };
            list.appendChild(row);
        });
        if (nearBottom || collabChat.length <= 1) list.scrollTop = list.scrollHeight;
    }
    document.querySelectorAll(".collab-chat-dot").forEach(dot => {
        dot.hidden = collabChatUnread === 0;
        dot.textContent = collabChatUnread > 9 ? "9+" : String(collabChatUnread);
    });
}

function collabChatClean(raw) {
    if (!raw || typeof raw !== "object") return null;
    if (typeof raw.id !== "string" || raw.id.length > 80 || typeof raw.text !== "string") return null;
    const text = raw.text.trim().slice(0, COLLAB_CHAT_LEN);
    if (!text) return null;
    return {
        id: raw.id,
        peerId: String(raw.peerId || "").slice(0, 40),
        name: String(raw.name || "Artist").slice(0, 24),
        text,
        ts: Number.isFinite(raw.ts) ? raw.ts : Date.now()
    };
}

// returns true when the message was new
function collabChatAdd(msg) {
    if (collabChatIds.has(msg.id)) return false;
    collabChatIds.add(msg.id);
    collabChat.push(msg);
    collabChat.sort((a, b) => a.ts - b.ts);
    while (collabChat.length > COLLAB_CHAT_MAX) collabChatIds.delete(collabChat.shift().id);
    return true;
}

function collabChatDeliver(msg) {
    collabSend("chat-msg", { id: msg.id, peerId: msg.peerId, name: msg.name, text: msg.text, ts: msg.ts }).then(ok => {
        msg.status = ok ? "sent" : "failed";
        collabChatRender();
    });
}

function collabChatSend(text) {
    if (!collabChannel) { showToast("Join a shared room to chat"); return false; }
    text = String(text || "").trim().slice(0, COLLAB_CHAT_LEN);
    if (!text) return false;
    const now = Date.now();
    if (now - collabChatLastSentAt < 250) return false;
    collabChatLastSentAt = now;
    const msg = {
        id: collabSelfKey + ":" + now.toString(36) + Math.random().toString(36).slice(2, 6),
        peerId: collabSelfKey,
        name: collabArtistName(),
        text, ts: now, status: "sending"
    };
    collabChatAdd(msg);
    collabChatRender();
    collabChatDeliver(msg);
    haptic(6);
    return true;
}

function collabChatReceive(payload) {
    if (!collabChannel || !payload || payload.peerId === collabSelfKey) return;
    const msg = collabChatClean(payload);
    if (!msg) return;
    msg.status = "sent";
    if (!collabChatAdd(msg)) return;
    if (!collabChatIsOpen()) {
        collabChatUnread++;
        showToast("💬 " + msg.name + ": " + msg.text.slice(0, 40));
        haptic(10);
    }
    collabChatRender();
}

function collabChatReceiveHistory(payload) {
    if (!collabChannel || !payload || payload.peerId === collabSelfKey || !Array.isArray(payload.messages)) return;
    let added = 0;
    payload.messages.slice(0, 80).forEach(raw => {
        const msg = collabChatClean(raw);
        if (!msg) return;
        msg.status = "sent";
        if (collabChatAdd(msg)) {
            added++;
            if (msg.peerId !== collabSelfKey && !collabChatIsOpen()) collabChatUnread++;
        }
    });
    if (added) collabChatRender();
}

// tell the other side which ids we hold; they push anything we are missing
function collabChatHeartbeat() {
    if (!collabChannel) return;
    collabChatSyncVisibility();
    collabChat.filter(m => m.peerId === collabSelfKey && m.status === "failed").forEach(m => { m.status = "sending"; collabChatDeliver(m); });
    collabSend("chat-sync", { peerId: collabSelfKey, have: collabChat.slice(-60).map(m => m.id) });
}

function collabChatReceiveSync(payload) {
    if (!collabChannel || !payload || payload.peerId === collabSelfKey || !Array.isArray(payload.have)) return;
    const have = new Set(payload.have.slice(0, 120).map(String));
    const missing = collabChat.slice(-60).filter(m => !have.has(m.id));
    if (!missing.length) return;
    collabSend("chat-history", {
        peerId: collabSelfKey,
        messages: missing.map(m => ({ id: m.id, peerId: m.peerId, name: m.name, text: m.text, ts: m.ts }))
    });
}

function collabChatJoined() {
    collabChatEnsureUI();
    collabChatSyncVisibility();
    collabChatRender();
    clearInterval(collabChatTimer);
    collabChatTimer = setInterval(collabChatHeartbeat, 5000);
    setTimeout(collabChatHeartbeat, 400);
    setTimeout(collabChatHeartbeat, 1800);
}

function collabChatReset() {
    clearInterval(collabChatTimer);
    collabChatTimer = null;
    collabChat = [];
    collabChatIds = new Set();
    collabChatUnread = 0;
    collabChatClose();
    collabChatRender();
    collabChatSyncVisibility();
}

collabChatEnsureUI();

"""

CHAT_ON = """.on("broadcast", { event: "snapshot-request" }, () => sendCollabSnapshot())
.on("broadcast", { event: "chat-msg" }, ({ payload }) => collabChatReceive(payload))
.on("broadcast", { event: "chat-sync" }, ({ payload }) => collabChatReceiveSync(payload))
.on("broadcast", { event: "chat-history" }, ({ payload }) => collabChatReceiveHistory(payload))"""

def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    path = sys.argv[1]
    src = open(path, encoding="utf-8").read()
    out = src

    if "keepVisible" not in out:
        out = patch(out, PAN_OLD, PAN_NEW, "pan clamp (symmetric, free movement)")
        out = patch(out, APPLY_OLD, APPLY_NEW, "applyStudioTransform (no forced pan reset)")
    else:
        print("[skip] zoom/pan fix already applied")

    if "collabChatJoined" in out and "collab-chat-overlay" not in out:
        sys.exit("An older chat version is already in this file. Restore the .bak backup (copy freedom.js.bak over freedom.js) and run this script again.")
    if "collabChatJoined" not in out:
        out = patch(out, "Object.assign(window, { startCollaboration, leaveCollaboration, copyCollabInvite });",
                    CHAT_JS + "Object.assign(window, { startCollaboration, leaveCollaboration, copyCollabInvite, collabChatSend, collabChatToggle });",
                    "chat engine + UI")
        out = patch(out, '.on("broadcast", { event: "snapshot-request" }, () => sendCollabSnapshot())', CHAT_ON, "chat broadcast listeners")
        out = patch(out, 'if (!collabIsHost) updateCollabUI("connecting", "Syncing shared drawing…");',
                    'if (!collabIsHost) updateCollabUI("connecting", "Syncing shared drawing…");\ncollabChatJoined();',
                    "start chat when room is joined")
        out = patch(out, "if (channel && window.sbClient) {", "collabChatReset();\nif (channel && window.sbClient) {", "reset chat on leave")
        out = patch(out, "if (invite) invite.hidden = !collabChannel; renderCollabInviteQR();",
                    "if (invite) invite.hidden = !collabChannel; renderCollabInviteQR(); collabChatSyncVisibility();",
                    "show/hide chat with room state")
    else:
        print("[skip] team chat already applied")

    if out == src:
        print("Nothing to change.")
        return
    shutil.copyfile(path, path + ".bak")
    open(path, "w", encoding="utf-8").write(out)
    print(f"\nDone. Backup: {path}.bak")

if __name__ == "__main__":
    main()