#!/usr/bin/env python3
"""
update_walljs_v3.py - run AFTER update_walljs.py (V1) and update_walljs_v2.py (V2).

Usage:  python3 update_walljs_v3.py freedom.js

Changes:
  * Guests see a note in the Post tab explaining why posting is disabled.
  * When the room is full (2 people) the invite link, copy, share and QR are
    hidden for the host too. They return if someone leaves.
  * QR card redesigned: header, QR, "Scan to join". No code pill, no footer note.
  * Team tab buttons sit in one row and share the width equally
    (Start room | Scan invite, and Leave | Team chat).
"""
import re
import shutil
import sys
import os

V2 = "__ARTCHER_TEAM_UPDATE_V2__"
MARKER = "__ARTCHER_TEAM_UPDATE_V3__"
ANCHOR = 'const APK_DOWNLOAD_URL = "download/ARTcher-v1.11.apk";'

BLOCK = r"""
/* __ARTCHER_TEAM_UPDATE_V3__ =================================================
   Post-disabled note, hide sharing when full, simple QR, equal-width buttons.
=========================================================================== */
(function () {
    const s = document.createElement("style");
    s.textContent =
        ".tm-wrap .tm-actions{flex-wrap:nowrap}" +
        ".tm-wrap .tm-actions>.tm-btn{flex:1 1 0;min-width:0;white-space:nowrap}" +
        ".tm-wrap .tm-actions>.tm-btn span{overflow:hidden;text-overflow:ellipsis}" +
        "#collab-post-note{display:flex;gap:10px;align-items:flex-start;padding:12px 14px;margin:6px 0;border-radius:14px;" +
        "background:var(--accent-soft,#eff6ff);border:1px solid #e2e8f0;font-size:12.5px;line-height:1.4;font-weight:600}" +
        "#collab-post-note strong{display:block;font-size:13px;margin-bottom:2px}" +
        "#collab-post-note small{display:block;font-weight:500;color:var(--muted,#64748b);font-size:11.5px}";
    document.head.appendChild(s);
})();

/* ---------- room full? ---------- */
function collabRoomFull() {
    if (!collabChannel) return false;
    try { return Object.keys(collabChannel.presenceState() || {}).length >= 2; }
    catch (e) { return false; }
}

/* ---------- guest / room UI (replaces the V2 version) ---------- */
collabApplyGuestUI = function () {
    const inRoom = !!collabChannel, guest = collabIsGuest();
    const hideIf = (id, cond) => {
        const el = tmEl(id);
        if (el) el.toggleAttribute("data-collab-hide", !!cond);
    };

    /* Team tab: one row for the buttons */
    const row = document.querySelector("#pane-team .collab-actions");
    const chat = tmEl("collab-chat-pane-btn");
    if (row && chat && chat.parentElement !== row) row.appendChild(chat);
    hideIf("collab-chat-pane-btn", !inRoom);
    hideIf("collab-start-btn", inRoom);
    hideIf("tm-join-btn", inRoom);
    hideIf("collab-invite", guest || collabRoomFull());   // link + copy + share + QR

    /* Post tab */
    document.querySelectorAll("[data-collab-post-hid]").forEach(el => {
        el.removeAttribute("data-collab-hide");
        el.removeAttribute("data-collab-post-hid");
    });
    const oldNote = tmEl("collab-post-note");
    if (!guest) { if (oldNote) oldNote.remove(); return; }

    const hide = el => { el.setAttribute("data-collab-hide", ""); el.setAttribute("data-collab-post-hid", ""); };
    const btn = tmEl("submit-btn");
    const quick = tmEl("focus-quick-post-btn");
    if (quick) hide(quick);
    if (!btn) return;
    hide(btn);

    const pane = btn.closest('[id^="pane-"],.tab-pane,.draw-pane,.pane');
    if (pane && pane.querySelector(COLLAB_POST_KEEP)) {
        const holdsKeep = el => el.id === "collab-post-note" || el.matches(COLLAB_POST_KEEP) || !!el.querySelector(COLLAB_POST_KEEP);
        let node = btn;
        while (node && node !== pane && node.parentElement) {
            Array.from(node.parentElement.children).forEach(sib => {
                if (sib !== node && !holdsKeep(sib)) hide(sib);
            });
            node = node.parentElement;
        }
    }

    /* explain why posting is off */
    let note = oldNote;
    if (!note) {
        note = document.createElement("div");
        note.id = "collab-post-note";
        note.setAttribute("role", "note");
        note.innerHTML = '<span>🔒</span><div><strong>Posting is disabled</strong>' +
            'Only the host can post a shared drawing.' +
            '<small>Your own design comes back when you leave the room.</small></div>';
    }
    if (note.parentElement !== btn.parentElement || note.nextSibling !== btn) btn.parentElement.insertBefore(note, btn);
};

const _updateCollabPresenceUIV3 = updateCollabPresenceUI;
updateCollabPresenceUI = function () {
    const r = _updateCollabPresenceUIV3.apply(this, arguments);
    try { collabApplyGuestUI(); } catch (e) {}
    return r;
};

/* ---------- simple QR card ---------- */
collabComposeQrCard = function (qrImg) {
    const W = 520, H = 660;
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const x = c.getContext("2d");
    const accent = (getComputedStyle(document.documentElement).getPropertyValue("--accent") || "#1d4ed8").trim();

    x.fillStyle = "#eef2f7"; x.fillRect(0, 0, W, H);
    x.save();
    x.shadowColor = "rgba(15,23,42,.18)"; x.shadowBlur = 28; x.shadowOffsetY = 8;
    x.fillStyle = "#fff"; x.beginPath(); x.roundRect(30, 30, W - 60, H - 60, 32); x.fill();
    x.restore();

    x.save();
    x.beginPath(); x.roundRect(30, 30, W - 60, 120, [32, 32, 0, 0]); x.clip();
    const g = x.createLinearGradient(30, 30, W - 30, 150);
    g.addColorStop(0, accent); g.addColorStop(1, "#7c3aed");
    x.fillStyle = g; x.fillRect(30, 30, W - 60, 120);
    x.restore();
    x.textAlign = "center"; x.fillStyle = "#fff";
    x.font = "800 38px Inter, sans-serif"; x.fillText("Draw together", W / 2, 106);

    const qs = 320, qx = (W - qs) / 2, qy = 186;
    x.imageSmoothingEnabled = false;
    x.drawImage(qrImg, qx, qy, qs, qs);
    x.imageSmoothingEnabled = true;

    x.fillStyle = "#0f172a"; x.font = "800 32px Inter, sans-serif";
    x.fillText("Scan to join", W / 2, qy + qs + 70);
    return c.toDataURL("image/png");
};

/* ---------- init ---------- */
(function () {
    const w = tmEl("collab-qr-card");
    if (w) w.dataset.inviteUrl = "";            // force the QR to redraw with the new design
    try { renderCollabInviteQR(); } catch (e) {}
    try { collabApplyGuestUI(); } catch (e) {}
})();
"""


def anchor_regex(text):
    return re.compile(r"\s+".join(re.escape(t) for t in text.split()))


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 update_walljs_v3.py freedom.js")
        sys.exit(1)
    path = sys.argv[1]
    if not os.path.isfile(path):
        print("File not found: " + path)
        sys.exit(1)
    with open(path, "r", encoding="utf-8", newline="") as f:
        src = f.read()
    if MARKER in src:
        print("V3 already applied.")
        return
    if V2 not in src:
        print("Run update_walljs.py (V1) and update_walljs_v2.py (V2) first.")
        sys.exit(2)
    matches = list(anchor_regex(ANCHOR).finditer(src))
    if len(matches) != 1:
        print("[FAIL] APK anchor -> %d matches (expected 1)" % len(matches))
        sys.exit(2)
    m = matches[0]
    out = src[:m.start()] + BLOCK + "\n" + m.group(0) + src[m.end():]
    bak = path + ".v3.bak"
    if not os.path.exists(bak):
        shutil.copyfile(path, bak)
    with open(path, "w", encoding="utf-8", newline="") as f:
        f.write(out)
    print("Done. V3 applied to " + path)


if __name__ == "__main__":
    main()