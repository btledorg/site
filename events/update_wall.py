#!/usr/bin/env python3
"""
fix_wall.py  -  second patch for freedomwall.html (The ARTcher)

Usage:
    python fix_wall.py freedomwall.html

Fixes / adds:
  1. Stencils shown twice (Trace tab). initUpgradeControls() appended the buttons
     on top of the ones applySeasonalTheme() had already drawn. The list is now
     cleared before it is rebuilt, so it is correct at load and after a theme change.
  2. Reactions (like -> unlike -> like again):
       - clicks are queued per tile/reaction, so rapid taps always end on the state
         the user last chose (the server only supports "toggle")
       - a slow background refresh or a live broadcast can no longer overwrite a
         reaction that is still being saved
       - failed saves roll back to the last confirmed state and re-sync
  3. 15 more text fonts (Text tab), preloaded so wall replays show them correctly.

Independent of update_wall.py: run it before or after. Writes a backup first and
changes nothing if any anchor is missing.
"""
import re
import shutil
import sys
import time

MARKER = "FIX-V2-LIKES"


def die(msg):
    print("ERROR: " + msg)
    sys.exit(1)


def sub_once(src, old, new, label):
    n = src.count(old)
    if n != 1:
        die("anchor '%s' expected once, found %d (no file was changed)" % (label, n))
    print("  ok  " + label)
    return src.replace(old, new)


def re_once(src, pattern, repl, label):
    out, n = re.subn(pattern, lambda m: repl(m), src, count=1, flags=re.S)
    if n != 1:
        die("pattern '%s' not found exactly once (no file was changed)" % label)
    print("  ok  " + label)
    return out


def function_span(src, signature):
    """Return (start, end) of a function whose text begins with `signature`
    (the signature must end with the opening '{'). Brace matched, skips strings."""
    if src.count(signature) != 1:
        die("function '%s' expected once, found %d" % (signature, src.count(signature)))
    start = src.index(signature)
    i = start + len(signature)
    depth = 1
    n = len(src)
    while i < n and depth > 0:
        ch = src[i]
        if ch in "\"'`":
            q = ch
            i += 1
            while i < n and src[i] != q:
                if src[i] == "\\":
                    i += 1
                i += 1
        elif ch == "/" and src[i + 1:i + 2] == "/":
            while i < n and src[i] != "\n":
                i += 1
        elif ch == "/" and src[i + 1:i + 2] == "*":
            i = src.index("*/", i + 2) + 1
        elif ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
        i += 1
    if depth != 0:
        die("could not find the end of '%s'" % signature)
    return start, i


def replace_function(src, signature, new_code, label):
    s, e = function_span(src, signature)
    print("  ok  " + label)
    return src[:s] + new_code + src[e:]


# --------------------------------------------------------------------------
# fonts
# --------------------------------------------------------------------------
# (select value, CSS stack, label, Google Fonts family query)
FONTS = [
    ("Lobster", "'Lobster', cursive", "Lobster (script)", "Lobster"),
    ("Pacifico", "'Pacifico', cursive", "Pacifico (retro script)", "Pacifico"),
    ("Dancing Script", "'Dancing Script', cursive", "Dancing Script", "Dancing+Script:wght@700"),
    ("Satisfy", "'Satisfy', cursive", "Satisfy (brush script)", "Satisfy"),
    ("Permanent Marker", "'Permanent Marker', cursive", "Permanent Marker", "Permanent+Marker"),
    ("Gloria Hallelujah", "'Gloria Hallelujah', cursive", "Gloria Hallelujah (hand)", "Gloria+Hallelujah"),
    ("Shadows Into Light", "'Shadows Into Light', cursive", "Shadows Into Light", "Shadows+Into+Light"),
    ("Bebas Neue", "'Bebas Neue', Impact, sans-serif", "Bebas Neue (tall caps)", "Bebas+Neue"),
    ("Bangers", "'Bangers', Impact, cursive", "Bangers (comic)", "Bangers"),
    ("Righteous", "'Righteous', sans-serif", "Righteous", "Righteous"),
    ("Fredoka", "'Fredoka', sans-serif", "Fredoka (rounded)", "Fredoka:wght@600"),
    ("Abril Fatface", "'Abril Fatface', Georgia, serif", "Abril Fatface (display serif)", "Abril+Fatface"),
    ("Special Elite", "'Special Elite', 'Courier New', monospace", "Special Elite (typewriter)", "Special+Elite"),
    ("Orbitron", "'Orbitron', sans-serif", "Orbitron (sci-fi)", "Orbitron:wght@700"),
    ("Creepster", "'Creepster', cursive", "Creepster (spooky)", "Creepster"),
]

FONT_LINK_EXTRA = "".join("&family=" + f[3] for f in FONTS)

FONT_MAP_EXTRA = "".join(
    ',\n                            "%s": "%s"' % (f[0], f[1]) for f in FONTS
)

FONT_OPTIONS = "".join(
    '\n                                            <option value="%s" style="font-family:%s">%s</option>'
    % (f[0], f[1], f[2])
    for f in FONTS
)

PRELOAD_FN = r"""
                        // FIX-V2-FONTS: load every text font up front so canvas text (export, replay,
                        // wall tiles) never renders in a fallback font.
                        function preloadAllFonts() {
                            if (!document.fonts || !document.fonts.load) return;
                            const jobs = Object.keys(FONT_FAMILIES).map(k =>
                                document.fonts.load('700 24px "' + k + '"').catch(() => null));
                            Promise.all(jobs).then(() => {
                                try { tileBitmapCache.clear(); scheduleWallPaint(); } catch (e) {}
                            });
                        }
"""

# --------------------------------------------------------------------------
# reactions
# --------------------------------------------------------------------------
REACTIONS_JS = r"""// ===== FIX-V2-LIKES: safe like / unlike / like again =====
                        // reactPending: "tileId:type" -> { want, serverOn }   (one save loop per key)
                        // reactTouched: tileId -> time of the last local change
                        const reactPending = new Map();
                        const reactTouched = {};

                        function reactIdBusy(id, exceptKey) {
                            for (const k of reactPending.keys()) {
                                if (k !== exceptKey && k.startsWith(id + ":")) return true;
                            }
                            return false;
                        }

                        async function loadReactions() {
                            const startedAt = Date.now();
                            try {
                                const res = await fetch(`${GAS_WEB_APP_URL}?module=freedomwallreactions&voter=${encodeURIComponent(voterId)}&_t=${Date.now()}`);
                                const j = await res.json();
                                if (!j.ok) return;
                                const nextR = Object.assign({}, j.data || {});
                                const nextM = Object.assign({}, j.mine || {});
                                // keep local state for anything saved/being saved since this request began
                                Object.keys(reactions).forEach(id => {
                                    if (reactIdBusy(id) || (reactTouched[id] || 0) >= startedAt) {
                                        nextR[id] = reactions[id];
                                        if (myReactions[id]) nextM[id] = myReactions[id];
                                    }
                                });
                                reactions = nextR;
                                myReactions = nextM;
                                document.querySelectorAll(".wall-tile").forEach(t => updateTilePill(t.dataset.id));
                                if (modalEntry) updateReactBar();
                            } catch (e) {}
                        }

                        async function postReactionToggle(id, type) {
                            const res = await fetch(GAS_WEB_APP_URL, {
                                method: "POST",
                                headers: { "Content-Type": "text/plain;charset=utf-8" },
                                body: JSON.stringify({ action: "reactFreedomWall", id, type, voter: voterId })
                            });
                            const j = await res.json();
                            if (!j.ok) throw new Error(j.error || "failed");
                            return j;
                        }

                        async function toggleReaction(type) {
                            if (!modalEntry || modalEntry._pending) return;
                            if (!navigator.onLine) { showToast("Reactions need internet."); return; }
                            const id = modalEntry.id;
                            const key = id + ":" + type;
                            haptic(10);

                            // 1) update the screen right away
                            const counts = Object.assign(zeroCounts(), reactions[id]);
                            const mineList = (myReactions[id] || []).slice();
                            const wasOn = mineList.includes(type);
                            reactions[id] = Object.assign({}, counts, { [type]: Math.max(0, counts[type] + (wasOn ? -1 : 1)) });
                            myReactions[id] = wasOn ? mineList.filter(t => t !== type) : mineList.concat(type);
                            reactTouched[id] = Date.now();
                            updateReactBar(); updateTilePill(id);

                            // 2) a save loop is already running for this reaction: just tell it the new goal
                            let st = reactPending.get(key);
                            if (st) { st.want = !wasOn; return; }

                            // 3) otherwise start one. The server only toggles, so keep toggling until
                            //    the server state matches what the user last asked for.
                            st = { want: !wasOn, serverOn: wasOn };
                            reactPending.set(key, st);
                            let failed = false;
                            try {
                                for (let guard = 0; st.serverOn !== st.want && guard < 8; guard++) {
                                    const j = await postReactionToggle(id, type);
                                    const nowOn = typeof j.active === "boolean" ? j.active : !st.serverOn;
                                    if (nowOn === st.serverOn) break;          // server did not flip: stop, re-sync below
                                    st.serverOn = nowOn;
                                    if (st.serverOn === st.want && j.counts) {
                                        // settled: take the server's numbers (only this type if others are mid-save)
                                        reactions[id] = reactIdBusy(id, key)
                                            ? Object.assign({}, reactions[id], { [type]: j.counts[type] })
                                            : Object.assign(zeroCounts(), j.counts);
                                        const m = new Set(myReactions[id] || []);
                                        if (st.serverOn) m.add(type); else m.delete(type);
                                        myReactions[id] = [...m];
                                        reactTouched[id] = Date.now();
                                        updateReactBar(); updateTilePill(id);
                                        if (wallChannel && wallChannel.state === "joined" && !reactIdBusy(id, key)) {
                                            wallChannel.send({ type: "broadcast", event: "reaction", payload: { id, counts: reactions[id] } });
                                        }
                                    }
                                }
                                if (st.serverOn !== st.want) failed = true;
                            } catch (e) {
                                failed = true;
                            } finally {
                                reactPending.delete(key);
                            }

                            if (failed) {
                                showToast("Couldn't save reaction. Re-syncing…");
                                const m = new Set(myReactions[id] || []);
                                if (st.serverOn) m.add(type); else m.delete(type);
                                myReactions[id] = [...m];
                                reactTouched[id] = 0;
                                updateReactBar(); updateTilePill(id);
                                loadReactions();                                // pull the real counts back
                            }
                        }"""

BROADCAST_GUARD = "if (!payload || !payload.id || !payload.counts) return;"


def main():
    if len(sys.argv) != 2:
        die("usage: python fix_wall.py freedomwall.html")
    path = sys.argv[1]
    with open(path, "r", encoding="utf-8", newline="") as f:
        html = f.read()

    if MARKER in html:
        die("this file already has the reaction fix. Nothing changed.")

    print("Checking anchors in %s ..." % path)

    # ---- fonts -----------------------------------------------------------
    html = sub_once(
        html,
        "&family=Press+Start+2P&display=swap",
        "&family=Press+Start+2P" + FONT_LINK_EXTRA + "&display=swap",
        "Google Fonts link",
    )
    html = sub_once(
        html,
        '"JetBrains Mono": "\'JetBrains Mono\', monospace"',
        '"JetBrains Mono": "\'JetBrains Mono\', monospace"' + FONT_MAP_EXTRA,
        "FONT_FAMILIES",
    )
    html = sub_once(
        html,
        '<option value="JetBrains Mono">Mono</option>',
        '<option value="JetBrains Mono">Mono</option>' + FONT_OPTIONS,
        "font dropdown",
    )
    html = sub_once(html, "const CELL_SIZE = 190;", "const CELL_SIZE = 190;\n" + PRELOAD_FN, "preloadAllFonts()")
    html = sub_once(html, "loadDraft();", "loadDraft();\n                        preloadAllFonts();", "call preloadAllFonts()")

    # ---- stencils shown twice ---------------------------------------------
    html = re_once(
        html,
        r'(const stencilList = document\.getElementById\("stencil-list"\);)(\s*)(Object\.entries\(STENCILS\))',
        lambda m: m.group(1) + '\n                            stencilList.innerHTML = ""; // FIX: never append on top of an existing list\n                            ' + m.group(3),
        "stencil list cleared before it is built",
    )

    # ---- reactions --------------------------------------------------------
    html = replace_function(html, "async function loadReactions() {", "@@REACT@@", "replace loadReactions()")
    html = replace_function(html, "async function toggleReaction(type) {", "", "remove old toggleReaction()")
    html = html.replace("@@REACT@@", REACTIONS_JS)
    html = sub_once(
        html,
        BROADCAST_GUARD,
        BROADCAST_GUARD + "\n                                if (reactIdBusy(payload.id)) return;   // don't overwrite a reaction we are still saving",
        "live broadcast guard",
    )

    backup = "%s.bak-fix-%d" % (path, int(time.time()))
    shutil.copyfile(path, backup)
    with open(path, "w", encoding="utf-8", newline="") as f:
        f.write(html)
    print("Done. Backup: " + backup)
    print("Hard-refresh the page (Ctrl+Shift+R) so the new fonts and script load.")


if __name__ == "__main__":
    main()