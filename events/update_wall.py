#!/usr/bin/env python3
"""
update_events_v2.py - upgrades a freedomwall.html that ALREADY has the Events
feature (from update_wall.py v1) to the latest front-end:

  1. fixes the createEvent() name clash   -> hostEvent()
  2. host token: only the device that created an event sees "End & archive"
  3. removes the Host PIN field and every PIN check

Usage:
    python update_events_v2.py freedomwall.html
    python update_events_v2.py freedomwall.html --dry-run
    python update_events_v2.py freedomwall.html -o freedomwall.new.html

Every step is idempotent: if a change is already in the file it is skipped,
so it is safe whether you edited some parts by hand or none. Nothing is
written unless every needed step succeeds. A .bak copy is made first.

(Apps Script changes are separate: createFWEvent / endFWEvent / findEvent_ /
getEventSheet_ must be updated there and redeployed as a NEW VERSION.)
"""
import argparse
import re
import shutil
import sys
from pathlib import Path

HOST_HELPERS = r'''const LS_HOST = "fw_host_tokens_v1";
                        function hostToken(code) { return (lsGet(LS_HOST, {}) || {})[code] || ""; }
                        function setHostToken(code, tok) {
                            const m = lsGet(LS_HOST, {}) || {};
                            if (tok) m[code] = tok; else delete m[code];
                            lsSet(LS_HOST, m);
                        }
                        function isHost() { return !!curEvent && !!hostToken(curEvent.code); }'''

CUR_LEFT_OLD = 'evEl("event-cur-left").textContent = curEvent.status === "archived" ? "Archived · read-only" : fmtLeft(curEvent.endTs - Date.now());'
CUR_LEFT_NEW = 'evEl("event-cur-left").textContent = (curEvent.status === "archived" ? "Archived · read-only" : fmtLeft(curEvent.endTs - Date.now())) + (isHost() ? " · You’re the host" : "");'

ENDBTN_OLD = 'if (endBtn) endBtn.hidden = !(curEvent && curEvent.status === "active");'
ENDBTN_NEW = 'if (endBtn) endBtn.hidden = !(curEvent && curEvent.status === "active" && isHost());'

END_EVENT_NOW = r'''function endEventNow() {
                            if (!curEvent || !isHost()) { showToast("Only the host can end this event."); return; }
                            const code = curEvent.code, token = hostToken(code);
                            askConsent("End this event?", `"${curEvent.name}" will be archived now and everyone returns to the main wall.`, async () => {
                                try {
                                    const j = await gasPost({ action: "endFWEvent", code, hostToken: token });
                                    if (!j.ok) { showToast(j.error || "Couldn't end the event."); return; }
                                    setHostToken(code, "");
                                    leaveEvent(true);
                                } catch (e) { showToast("Couldn't reach the server."); }
                            }, { danger: true, okLabel: "End & archive" });
                        }

                        '''


class Patcher:
    def __init__(self, text):
        self.text = text
        self.done = []
        self.skipped = []
        self.errors = []

    def step(self, label, already, apply):
        """already: bool (change present). apply: callable returning True/False."""
        if already:
            self.skipped.append(label)
            return
        try:
            ok = apply()
        except Exception as e:  # pragma: no cover
            ok, label = False, f"{label} ({e})"
        (self.done if ok else self.errors).append(label)

    def replace_once(self, old, new):
        if self.text.count(old) != 1:
            return False
        self.text = self.text.replace(old, new, 1)
        return True

    def regex_once(self, pattern, repl, flags=0):
        found = list(re.finditer(pattern, self.text, flags))
        if len(found) != 1:
            return False
        m = found[0]
        self.text = self.text[:m.start()] + repl + self.text[m.end():]
        return True

    def remove_optional(self, label, pattern):
        """Remove if present; fine if already gone."""
        self.text, n = re.subn(pattern, "", self.text)
        (self.done if n else self.skipped).append(label)


def build(text):
    p = Patcher(text)
    t = lambda: p.text  # noqa: E731

    if 'id="event-modal"' not in text:
        p.errors.append("Events feature not found - run update_wall.py first")
        return p

    # 1. rename createEvent -> hostEvent (inline handlers see document.createEvent first)
    p.step("rename createEvent() button -> hostEvent()",
           'onclick="createEvent()"' not in t(),
           lambda: p.replace_once('onclick="createEvent()"', 'onclick="hostEvent()"'))
    p.step("rename async function createEvent -> hostEvent",
           "async function createEvent()" not in t(),
           lambda: p.replace_once("async function createEvent()", "async function hostEvent()"))

    # 2. host token helpers (replaces the old evPin variable)
    p.step("host token helpers",
           "const LS_HOST" in t(),
           lambda: p.replace_once('let evPin = "";', HOST_HELPERS))

    p.step("modal: show 'You're the host'",
           "You’re the host" in t(),
           lambda: p.replace_once(CUR_LEFT_OLD, CUR_LEFT_NEW))

    p.step("End button only for the host device",
           "&& isHost());" in t() and "endBtn.hidden" in t() and ENDBTN_OLD not in t(),
           lambda: p.replace_once(ENDBTN_OLD, ENDBTN_NEW))

    # 3. remove PIN from the create flow
    p.remove_optional("remove PIN input from modal",
                      r'\n[ \t]*<input type="password" id="event-pin-input"[^\n]*')
    p.remove_optional("remove PIN read in hostEvent",
                      r'\n[ \t]*const pin = evEl\("event-pin-input"\)\.value\.trim\(\);')
    p.remove_optional("remove PIN check in hostEvent",
                      r'\n[ \t]*if \(!pin\) \{ showToast\("Enter the host PIN\."\); return; \}')

    p.step("createFWEvent request without PIN",
           'createFWEvent", name, hours, pin' not in t(),
           lambda: p.replace_once('gasPost({ action: "createFWEvent", name, hours, pin })',
                                  'gasPost({ action: "createFWEvent", name, hours })'))

    # 4. store the token the server returns
    p.step("save host token on create",
           "setHostToken(j.event.code" in t(),
           lambda: p.replace_once("evPin = pin;", "setHostToken(j.event.code, j.hostToken);"))

    # 5. end flow uses the token
    p.step("endEventNow uses host token",
           "hostToken: token" in t(),
           lambda: p.regex_once(r'function endEventNow\(\) \{.*?(?=// countdown \+ gentle server check)',
                                END_EVENT_NOW, re.S))

    # sanity checks on the result
    if not p.errors:
        if re.search(r'\bevPin\b', t()):
            p.errors.append("leftover 'evPin' reference - an unexpected edit is needed")
        if "createEvent()" in t():
            p.errors.append("leftover 'createEvent()' reference")
        if "event-pin-input" in t():
            p.errors.append("leftover 'event-pin-input' reference")
    return p


def main():
    ap = argparse.ArgumentParser(description="Upgrade an Events-enabled freedomwall.html (host token, no PIN).")
    ap.add_argument("file")
    ap.add_argument("-o", "--output")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    src = Path(args.file)
    if not src.is_file():
        sys.exit(f"File not found: {src}")

    p = build(src.read_text(encoding="utf-8"))

    for l in p.done:
        print(f"  ✓ {l}")
    for l in p.skipped:
        print(f"  - already done: {l}")

    if p.errors:
        print("\nPATCH FAILED. Nothing was written:")
        for l in p.errors:
            print(f"  x {l}")
        sys.exit(1)

    if not p.done:
        print("\nNothing to change. This file is already up to date.")
        return
    if args.dry_run:
        print("\nDry run: no file written.")
        return

    dest = Path(args.output) if args.output else src
    if dest == src:
        bak = src.with_suffix(src.suffix + ".bak2")
        shutil.copy2(src, bak)
        print(f"\nBackup: {bak}")
    dest.write_text(p.text, encoding="utf-8")
    print(f"Written: {dest}")
    print("\nNext: update the Apps Script (createFWEvent / endFWEvent / findEvent_ /")
    print("getEventSheet_) and redeploy as a NEW VERSION.")


if __name__ == "__main__":
    main()