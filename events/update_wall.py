#!/usr/bin/env python3
"""
update_wall.py - adds the EVENTS feature (join by code, per-event canvas,
auto-archive) to the ARTcher / Freedom Wall front-end.

Usage:
    python update_wall.py freedomwall.html
    python update_wall.py freedomwall.html -o freedomwall.new.html
    python update_wall.py freedomwall.html --dry-run

Safe by design:
  * every edit must match its anchor EXACTLY ONCE, otherwise nothing is written
  * a .bak copy is made before the file is changed
  * running it twice is harmless (it detects the patch and stops)

The Apps Script backend (FWEvents / FreedomWallArchive, router lines,
EVENT_ADMIN_PIN) is NOT touched by this script. Paste that part into your
Apps Script project and redeploy as a new version.
"""
import argparse
import re
import shutil
import sys
from pathlib import Path

MARKER = 'id="event-modal"'

# --------------------------------------------------------------------------
# PAYLOADS
# --------------------------------------------------------------------------

CSS = r'''
<style id="artcher-events">
.ev-current{border:1px solid var(--border);border-radius:14px;padding:12px;background:var(--accent-soft);display:flex;flex-direction:column;gap:6px}
.ev-code{font-family:'JetBrains Mono',monospace;font-weight:700;letter-spacing:.18em;font-size:20px}
.name-input.code{text-transform:uppercase;letter-spacing:.2em;font-family:'JetBrains Mono',monospace}
#event-pill{max-width:190px;overflow:hidden;text-overflow:ellipsis}
#event-host summary{cursor:pointer}
.host-body{display:flex;flex-direction:column;gap:8px;margin-top:8px}
</style>
'''

HTML_HUD = r'''
                            <button type="button" class="btn btn-secondary" id="event-btn" onclick="openEventModal()">Event</button>
                            <span class="hud-pill" id="event-pill" hidden></span>'''

HTML_POST_NOTE = r'''<div class="ref-badge-note" id="event-post-note">Posting to the main wall</div>
                                    '''

HTML_MORE_CARD = r'''<div class="card">
                                <div class="card-head">Events</div>
                                <button class="list-row" onclick="openEventModal()">
                                    <span class="lead">
                                        <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                                        <span>Join or host an event<small>Enter a code to open its own canvas</small></span>
                                    </span>
                                </button>
                            </div>

                            '''

HTML_MODAL = r'''<!-- EVENT MODAL -->
                    <div class="modal-backdrop" id="event-modal" onclick="if(event.target===this) closeEventModal()">
                        <div class="modal-box" role="dialog" aria-modal="true" aria-labelledby="event-title">
                            <div class="modal-head">
                                <h3 id="event-title">Events</h3>
                                <button type="button" class="btn btn-sm" onclick="closeEventModal()">Close</button>
                            </div>

                            <div class="ev-current" id="event-current" hidden>
                                <strong id="event-cur-name">—</strong>
                                <span class="ev-code" id="event-cur-code">------</span>
                                <small id="event-cur-left" style="color:var(--muted);font-weight:600;"></small>
                                <div class="modal-actions" style="margin-top:6px;">
                                    <button type="button" class="btn btn-sm" onclick="copyEventInvite()">Copy invite link</button>
                                    <button type="button" class="btn btn-sm" onclick="leaveEvent(false)">Leave event</button>
                                </div>
                            </div>

                            <div>
                                <div class="saved-label" style="margin-bottom:6px;">Join with code</div>
                                <div style="display:flex;gap:8px;">
                                    <input type="text" id="event-code-input" class="name-input code" maxlength="8" placeholder="K7M2QX" autocomplete="off" autocapitalize="characters"
                                           onkeydown="if(event.key==='Enter') submitJoinCode()">
                                    <button type="button" class="btn btn-accent" onclick="submitJoinCode()">Join</button>
                                </div>
                            </div>

                            <details id="event-host">
                                <summary class="saved-label">Host an event</summary>
                                <div class="host-body">
                                    <input type="text" id="event-name-input" class="name-input" maxlength="40" placeholder="Event name">
                                    <select id="event-hours-select" class="font-select">
                                        <option value="1">Lasts 1 hour</option>
                                        <option value="2">Lasts 2 hours</option>
                                        <option value="4" selected>Lasts 4 hours</option>
                                        <option value="8">Lasts 8 hours</option>
                                        <option value="24">Lasts 1 day</option>
                                        <option value="72">Lasts 3 days</option>
                                        <option value="168">Lasts 1 week</option>
                                    </select>
                                    <input type="password" id="event-pin-input" class="name-input" placeholder="Host PIN" autocomplete="off">
                                    <button type="button" class="btn btn-primary" onclick="createEvent()">Create event</button>
                                    <button type="button" class="btn btn-danger" id="event-end-btn" onclick="endEventNow()" hidden>End &amp; archive current event now</button>
                                </div>
                            </details>
                        </div>
                    </div>

                    '''

JS_STATE = r'''const LS_EVENT = "fw_event_v1";
                        let curEvent = lsGet(LS_EVENT, null);          // { code, name, startTs, endTs, status } or null = main wall
                        function evCode() { return curEvent ? curEvent.code : ""; }
                        function cacheKey() { return LS_CACHE + (curEvent ? ":" + curEvent.code : ""); }

                        pending = lsGet(LS_QUEUE, []);
                        serverEntries = lsGet(cacheKey(), []);'''

JS_REBUILD_PENDING = r'''pending.filter(p => !ids.has(p.id) && (p.event || "") === evCode()).map(p => Object.assign({}, p, { _pending: true }))'''

JS_NEWTILE_GUARD = r'''if (!payload || !payload.id) return;
                                if ((payload.event || "") !== evCode()) return;'''

JS_BROADCAST_LIGHT = r''': { id: entry.id, author: entry.author, gx: entry.gx, gy: entry.gy, event: entry.event || "" }'''

JS_FETCH_AND_UPLOAD = r'''async function fetchServerEntries(code = evCode()) {
                            const ctrl = new AbortController();
                            const to = setTimeout(() => ctrl.abort(), 20000);
                            try {
                                const res = await fetch(`${GAS_WEB_APP_URL}?module=freedomwall&event=${encodeURIComponent(code)}&_t=${Date.now()}`, { signal: ctrl.signal });
                                const json = await res.json();
                                if (json.ok && Array.isArray(json.data)) {
                                    if (code && code === evCode() && json.event) noteEventMeta(json.event);
                                    return json.data;
                                }
                                throw new Error(json.error || "Bad response");
                            } finally {
                                clearTimeout(to);
                            }
                        }

                        async function uploadPending(silent = false) {
                            if (uploading || pending.length === 0) return;
                            if (!navigator.onLine) { if (!silent) showToast("No internet right now. Try again when connected."); return; }

                            uploading = true;
                            setUploadUI();
                            const total = pending.length;
                            let done = 0, dropped = 0;
                            const snaps = {};                               // per-scope server snapshot

                            try {
                                for (const entry of pending.slice()) {
                                    const code = entry.event || "";
                                    if (!snaps[code]) {
                                        const latest = await fetchServerEntries(code);
                                        snaps[code] = { occupied: latest.slice(), ids: new Set(latest.map(e => e.id)) };
                                    }
                                    const snap = snaps[code];
                                    if (snap.ids.has(entry.id)) { removePending(entry.id); done++; continue; }

                                    if (snap.occupied.some(o => o.gx === entry.gx && o.gy === entry.gy)) {
                                        const others = pending.filter(p => p.id !== entry.id && (p.event || "") === code);
                                        const slot = pickRandomOpenSlot(snap.occupied.concat(others));
                                        entry.gx = slot.gx; entry.gy = slot.gy;
                                        lsSet(LS_QUEUE, pending);
                                    }

                                    const payload = {
                                        action: "addFreedomWall", id: entry.id, author: entry.author, gx: entry.gx, gy: entry.gy,
                                        strokes: entry.strokes, timestamp: entry.timestamp, event: code
                                    };
                                    const ctrl = new AbortController();
                                    const to = setTimeout(() => ctrl.abort(), 30000);
                                    let json;
                                    try {
                                        const res = await fetch(GAS_WEB_APP_URL, {
                                            method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },
                                            body: JSON.stringify(payload), signal: ctrl.signal
                                        });
                                        json = await res.json();
                                    } finally { clearTimeout(to); }

                                    if (json && json.ok) {
                                        removePending(entry.id);
                                        snap.occupied.push(entry);
                                        done++;
                                        broadcastWallEntry(entry);
                                    } else if (json && json.code === "EVENT_ENDED") {
                                        removePending(entry.id);            // event closed before this uploaded
                                        dropped++;
                                    } else {
                                        throw new Error((json && json.error) || "Upload failed");
                                    }
                                }
                            } catch (err) {}

                            uploading = false;
                            rebuildEntries();
                            setUploadUI();

                            if (dropped) showToast(`${dropped} drawing${dropped === 1 ? "" : "s"} couldn't be posted because the event ended.`);
                            else if (done === total) { if (done > 0) showToast(`Uploaded ${done} drawing${done === 1 ? "" : "s"} ✓`); }
                            else showToast(`Uploaded ${done} of ${total}. The rest are still saved here.`);

                            loadWallEntries({ autoPlay: false });
                        }
'''

JS_LOAD_LIST = r'''const evScope = evCode();
                                const list = await fetchServerEntries(evScope);
                                if (evScope !== evCode()) return;                 // user switched scope mid-request'''

JS_SUBMIT_GUARD = r'''if (curEvent && !evIsLive()) { showToast("This event has ended. Leave it to post on the main wall."); return; }
                            // user-initiated posts: choose a tile, then pass the human check'''

JS_ENTRY_EVENT = r'''strokes: items,
                                timestamp: Date.now(),
                                event: evCode()
                            };'''

JS_MODULE = r'''// =========================================================================
                        // EVENTS
                        // =========================================================================
                        const evEl = id => document.getElementById(id);
                        let evPin = "";

                        function normCode(c) { return String(c || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8); }
                        function evIsLive() { return !!curEvent && curEvent.status === "active" && Date.now() < curEvent.endTs; }
                        function fmtLeft(ms) {
                            if (ms <= 0) return "ending…";
                            const m = Math.floor(ms / 60000), h = Math.floor(m / 60), d = Math.floor(h / 24);
                            if (d > 0) return `${d}d ${h % 24}h left`;
                            if (h > 0) return `${h}h ${m % 60}m left`;
                            return `${Math.max(1, m)}m left`;
                        }
                        async function gasPost(payload) {
                            const res = await fetch(GAS_WEB_APP_URL, {
                                method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(payload)
                            });
                            return res.json();
                        }

                        function applyEventUI() {
                            const inEv = !!curEvent;
                            const btn = evEl("event-btn");
                            if (btn) btn.textContent = inEv ? "🎪 " + curEvent.code : "Event";

                            const pill = evEl("event-pill");
                            if (pill) {
                                pill.hidden = !inEv;
                                if (inEv) pill.textContent = curEvent.name.slice(0, 22) + " · " + (curEvent.status === "archived" ? "archived" : fmtLeft(curEvent.endTs - Date.now()));
                            }
                            const title = document.querySelector(".center-event-title");
                            const sub = document.querySelector(".center-event-sub");
                            if (title) {
                                title.textContent = inEv ? curEvent.name : "THE ARTcher";
                                title.style.fontSize = inEv && curEvent.name.length > 14 ? "18px" : "";
                            }
                            if (sub) sub.textContent = inEv ? "EVENT · " + curEvent.code : (activeSeason ? activeSeason.sub : "ARCHERSTUDIO");

                            const note = evEl("event-post-note");
                            if (note) note.textContent = inEv
                                ? (evIsLive() ? `Posting to event: ${curEvent.name}` : "This event has ended · posting is closed")
                                : "Posting to the main wall";
                            renderEventModal();
                        }

                        function renderEventModal() {
                            const box = evEl("event-current");
                            if (!box) return;
                            box.hidden = !curEvent;
                            if (curEvent) {
                                evEl("event-cur-name").textContent = curEvent.name;
                                evEl("event-cur-code").textContent = curEvent.code;
                                evEl("event-cur-left").textContent = curEvent.status === "archived" ? "Archived · read-only" : fmtLeft(curEvent.endTs - Date.now());
                            }
                            const endBtn = evEl("event-end-btn");
                            if (endBtn) endBtn.hidden = !(curEvent && curEvent.status === "active");
                        }

                        // swap the whole app between the main wall and an event
                        function setScope(ev) {
                            curEvent = ev || null;
                            lsSet(LS_EVENT, curEvent);
                            serverEntries = lsGet(cacheKey(), []);
                            tileBitmapCache.clear();
                            loadingWall = false;
                            userMoved = false;
                            myTileCycleIdx = -1;
                            rebuildEntries();
                            setUploadUI();
                            applyEventUI();
                            if (currentView === "wall") renderWall(true);
                            loadWallEntries({ autoPlay: true, manual: false });
                        }

                        // called whenever the server reports the current event's status
                        function noteEventMeta(meta) {
                            if (!curEvent || meta.code !== curEvent.code) return;
                            const wasLive = curEvent.status === "active";
                            curEvent = Object.assign({}, curEvent, meta);
                            lsSet(LS_EVENT, curEvent);
                            if (wasLive && meta.status === "archived") { setTimeout(() => leaveEvent(true), 0); return; }
                            applyEventUI();
                        }

                        async function joinEventByCode(raw) {
                            const code = normCode(raw);
                            if (code.length < 4) { showToast("Enter the event code."); return false; }
                            if (!navigator.onLine) { showToast("Joining needs internet."); return false; }
                            try {
                                const res = await fetch(`${GAS_WEB_APP_URL}?module=fwevent&code=${code}&_t=${Date.now()}`);
                                const j = await res.json();
                                if (!j.ok || !j.event) { showToast("No event with that code."); return false; }
                                setScope(j.event);
                                showToast(j.event.status === "archived" ? `Viewing archived event: ${j.event.name}` : `Joined ${j.event.name} 🎪`);
                                haptic(12);
                                return true;
                            } catch (e) {
                                showToast("Couldn't reach the server.");
                                return false;
                            }
                        }

                        function leaveEvent(auto) {
                            if (!curEvent) return;
                            const name = curEvent.name;
                            try { localStorage.removeItem(cacheKey()); } catch (e) {}
                            setScope(null);
                            closeEventModal();
                            showToast(auto ? `"${name}" has ended and was archived. Back to the main wall.` : "Back to the main wall");
                        }

                        function openEventModal() { renderEventModal(); evEl("event-modal").classList.add("open"); }
                        function closeEventModal() { evEl("event-modal").classList.remove("open"); }

                        async function submitJoinCode() {
                            const inp = evEl("event-code-input");
                            if (await joinEventByCode(inp.value)) { inp.value = ""; closeEventModal(); switchView("wall"); }
                        }

                        function copyEventInvite() {
                            if (!curEvent) return;
                            const url = location.origin + location.pathname + "?event=" + curEvent.code;
                            (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject())
                                .then(() => showToast("Invite link copied"))
                                .catch(() => showToast("Share this code: " + curEvent.code));
                        }

                        async function createEvent() {
                            const name = evEl("event-name-input").value.trim();
                            const pin = evEl("event-pin-input").value.trim();
                            const hours = Number(evEl("event-hours-select").value);
                            if (!name) { showToast("Give the event a name."); return; }
                            if (!pin) { showToast("Enter the host PIN."); return; }
                            try {
                                const j = await gasPost({ action: "createFWEvent", name, hours, pin });
                                if (!j.ok) { showToast(j.error || "Couldn't create the event."); return; }
                                evPin = pin;
                                evEl("event-name-input").value = "";
                                setScope(j.event);
                                showToast(`Event created · code ${j.event.code}`);
                            } catch (e) { showToast("Couldn't reach the server."); }
                        }

                        function endEventNow() {
                            if (!curEvent) return;
                            const pin = evEl("event-pin-input").value.trim() || evPin;
                            if (!pin) { showToast("Enter the host PIN first."); return; }
                            askConsent("End this event?", `"${curEvent.name}" will be archived now and everyone returns to the main wall.`, async () => {
                                try {
                                    const j = await gasPost({ action: "endFWEvent", code: curEvent.code, pin });
                                    if (!j.ok) { showToast(j.error || "Couldn't end the event."); return; }
                                    leaveEvent(true);
                                } catch (e) { showToast("Couldn't reach the server."); }
                            }, { danger: true, okLabel: "End & archive" });
                        }

                        // countdown + gentle server check so clients notice the end without refreshing
                        setInterval(() => { if (curEvent) applyEventUI(); }, 30000);
                        setInterval(() => {
                            if (curEvent && curEvent.status === "active" && !document.hidden && navigator.onLine) {
                                loadWallEntries({ autoPlay: false, manual: false, isLiveSync: true });
                            }
                        }, 60000);

                        '''

JS_STARTUP = r'''applyEventUI();
                        const _qEv = new URLSearchParams(location.search).get("event");
                        if (_qEv) joinEventByCode(_qEv).then(ok => { if (ok) switchView("wall"); });

                        '''


# --------------------------------------------------------------------------
# PATCH ENGINE
# --------------------------------------------------------------------------

class Patcher:
    def __init__(self, text):
        self.text = text
        self.errors = []
        self.applied = []

    def _fail(self, label, why):
        self.errors.append(f"  x {label}: {why}")

    def replace(self, label, old, new):
        n = self.text.count(old)
        if n != 1:
            return self._fail(label, f"anchor found {n} times (need exactly 1)")
        self.text = self.text.replace(old, new, 1)
        self.applied.append(label)

    def insert_before(self, label, anchor, payload):
        self.replace(label, anchor, payload + anchor)

    def regex(self, label, pattern, repl, flags=0):
        found = list(re.finditer(pattern, self.text, flags))
        if len(found) != 1:
            return self._fail(label, f"pattern matched {len(found)} times (need exactly 1)")
        m = found[0]
        out = repl(m) if callable(repl) else repl
        self.text = self.text[:m.start()] + out + self.text[m.end():]
        self.applied.append(label)


def build(text):
    p = Patcher(text)

    # ---- CSS --------------------------------------------------------------
    p.insert_before("CSS block", "</head>", CSS)

    # ---- HTML -------------------------------------------------------------
    p.regex("Wall HUD: Event button + pill",
            r'<button[^>]*onclick="jumpToMyTile\(\)"[^>]*>\s*My tile\s*</button>',
            lambda m: m.group(0) + HTML_HUD)

    p.insert_before("Post pane: event note", '<input type="text" id="author-input"', HTML_POST_NOTE)

    p.regex("More tab: Events card",
            r'<div class="card">\s*<div class="card-head">Wall</div>',
            lambda m: HTML_MORE_CARD + m.group(0))

    p.insert_before("Event modal", "<!-- CAPTCHA MODAL -->", HTML_MODAL)

    # ---- JS: state --------------------------------------------------------
    p.regex("JS state (curEvent, cacheKey)",
            r'pending = lsGet\(LS_QUEUE, \[\]\);\s*serverEntries = lsGet\(LS_CACHE, \[\]\);',
            lambda m: JS_STATE)

    # ---- JS: existing functions ------------------------------------------
    p.replace("rebuildEntries: scope pending",
              "pending.filter(p => !ids.has(p.id)).map(p => Object.assign({}, p, { _pending: true }))",
              JS_REBUILD_PENDING)

    p.replace("realtime new-tile: event guard",
              "if (!payload || !payload.id) return;",
              JS_NEWTILE_GUARD)

    p.replace("realtime new-tile: cache key",
              "lsSet(LS_CACHE, serverEntries);",
              "lsSet(cacheKey(), serverEntries);")

    p.replace("broadcastWallEntry: light payload",
              ": { id: entry.id, author: entry.author, gx: entry.gx, gy: entry.gy }",
              JS_BROADCAST_LIGHT)

    p.regex("fetchServerEntries + uploadPending",
            r'async function fetchServerEntries\(\).*?(?=\n\s*function setUploadUI\(\))',
            lambda m: JS_FETCH_AND_UPLOAD.rstrip("\n"),
            re.S)

    p.replace("loadWallEntries: scoped fetch",
              "const list = await fetchServerEntries();",
              JS_LOAD_LIST)

    p.replace("loadWallEntries: scoped cache",
              "lsSet(LS_CACHE, list);",
              "lsSet(cacheKey(), list);")

    p.replace("submitToWall: ended-event guard",
              "// user-initiated posts: choose a tile, then pass the human check",
              JS_SUBMIT_GUARD)

    p.regex("submitToWallCore: entry.event",
            r'strokes: items,\s*timestamp: Date\.now\(\)\s*\};',
            lambda m: JS_ENTRY_EVENT)

    # ---- JS: new module + startup ----------------------------------------
    p.insert_before("Events module",
                    "// ---------- wall search + My tile ----------",
                    JS_MODULE)

    p.insert_before("Startup: join from ?event=CODE",
                    'window.addEventListener("online", () => {',
                    JS_STARTUP)

    return p


def main():
    ap = argparse.ArgumentParser(description="Add the Events feature to the Freedom Wall HTML.")
    ap.add_argument("file", help="path to freedomwall.html")
    ap.add_argument("-o", "--output", help="write to this file instead of patching in place")
    ap.add_argument("--dry-run", action="store_true", help="check every anchor, write nothing")
    args = ap.parse_args()

    src = Path(args.file)
    if not src.is_file():
        sys.exit(f"File not found: {src}")

    text = src.read_text(encoding="utf-8")

    if MARKER in text or "fw_event_v1" in text:
        sys.exit("This file already has the Events feature. Nothing to do.")

    p = build(text)

    if p.errors:
        print("PATCH FAILED. Nothing was written. Anchors that did not match:\n")
        print("\n".join(p.errors))
        print("\nYour file probably differs from the version this script was written for.")
        sys.exit(1)

    print(f"All {len(p.applied)} edits matched:")
    for label in p.applied:
        print(f"  ✓ {label}")

    if args.dry_run:
        print("\nDry run: no file written.")
        return

    dest = Path(args.output) if args.output else src
    if dest == src:
        bak = src.with_suffix(src.suffix + ".bak")
        shutil.copy2(src, bak)
        print(f"\nBackup: {bak}")
    dest.write_text(p.text, encoding="utf-8")
    print(f"Written: {dest}")
    print("\nNext: paste the Apps Script backend (events + router lines + EVENT_ADMIN_PIN),")
    print("then redeploy the web app as a NEW VERSION.")


if __name__ == "__main__":
    main()