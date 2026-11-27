#!/usr/bin/env python3
"""
patch_consent.py -- "are you sure?" dialogs for risky actions + a Seasonal events master switch.

usage:  python patch_consent.py freedomwall_v3_native_rx.html [output.html]

RUN THIS LAST (after v3 / part C / reactions patches) so its wrappers are the outermost ones.

Asks before:   Save PNG (drawing + tile popup) - Save wall PNG (4K) - Replay video - Delete/clear layer
               Merge layers - Remove reference image - Remove ALL text boxes
               Stop radio / un-favorite station when it looks like an accidental double tap
Also adds:     More > Options > "Seasonal events". Off = no holiday theme/greeting/effects and the
               "Seasonal & Holiday Theme" card is hidden from More.
"""
import re, sys, pathlib, subprocess, tempfile, shutil

SEASON_ROW = r'''
                                <label class="list-row">
                                    <span>Seasonal events<small>Holiday themes, greetings &amp; effects</small></span>
                                    <span class="switch"><input type="checkbox" id="opt-seasons" checked onchange="applySeasonsToggle(true)"></span>
                                </label>'''

JS = r'''// =========================================================================
                        // CONSENT DIALOGS + SEASONAL MASTER SWITCH
                        // =========================================================================
                        var RADIO_DOUBLE_TAP_MS = 2500;   // stopping the radio / un-starring within this time of the last change asks first. Use Infinity to always ask.
                        var _radioStartedAt = 0, _favAt = {};

                        function askConsent(title, message, onOk, opts) {
                            opts = opts || {};
                            if (typeof confirmCriticalAction !== "function") { onOk(); return; }
                            if (pendingCriticalAction) return;                 // a dialog is already open
                            confirmCriticalAction(title, message, onOk);
                            const b = document.getElementById("confirm-continue");
                            if (b) {
                                b.textContent = opts.okLabel || "Continue";
                                b.classList.toggle("btn-danger", !!opts.danger);
                                b.classList.toggle("btn-accent", !opts.danger);
                            }
                            if (typeof haptic === "function") haptic(10);
                        }

                        // the shared dialog goes back to its default look after every use (Clear canvas relies on it)
                        const _cancelCritical = cancelCriticalAction;
                        cancelCriticalAction = function () {
                            _cancelCritical.apply(this, arguments);
                            const b = document.getElementById("confirm-continue");
                            if (b) { b.textContent = "Continue"; b.classList.add("btn-danger"); b.classList.remove("btn-accent"); }
                        };

                        // ---- saving / exporting ----
                        const _saveStudioPNG = saveStudioPNG;
                        saveStudioPNG = function () {
                            if (getAllFlattenedStrokes(false).length === 0) return _saveStudioPNG.apply(this, arguments);   // shows its own "draw something" toast
                            askConsent("Save as PNG?", "Your drawing will be downloaded to this device as a PNG image.", () => _saveStudioPNG(), { okLabel: "Save PNG" });
                        };

                        const _saveWallPNG = saveWallPNG;
                        saveWallPNG = function () {
                            askConsent("Save the whole wall as PNG?", "This renders every tile into one 4K (3840 x 2160) image. It can take several seconds and use a lot of memory on older phones.",
                                () => _saveWallPNG(), { okLabel: "Save wall" });
                        };

                        const _videoStudio = videoStudio;
                        videoStudio = function () {
                            if (getAllFlattenedStrokes(false).length === 0) return _videoStudio.apply(this, arguments);
                            askConsent("Record replay video?", "Your drawing is played back in real time and saved as a video. This takes a few seconds and the page must stay open.",
                                () => _videoStudio(), { okLabel: "Record" });
                        };

                        // ---- layers ----
                        const _deleteLayerById = deleteLayerById;
                        deleteLayerById = function (id, e) {
                            if (e && e.stopPropagation) e.stopPropagation();
                            const lyr = layers.find(l => l.id === id);
                            if (!lyr) return;
                            const isText = lyr.type === "text";
                            const onlyDraw = !isText && layers.filter(l => l.type === "draw").length <= 1;
                            const detail = isText ? "text layer" : `${lyr.strokes.length} stroke${lyr.strokes.length === 1 ? "" : "s"}`;
                            askConsent(onlyDraw ? "Clear this layer?" : "Delete layer?",
                                `"${lyr.name}" (${detail}) will be ${onlyDraw ? "cleared" : "deleted"}. This can't be undone.`,
                                () => _deleteLayerById(id, null), { danger: true, okLabel: onlyDraw ? "Clear" : "Delete" });
                        };

                        const _mergeLayerDown = mergeLayerDown;
                        mergeLayerDown = function () {
                            const idx = layers.findIndex(l => l.id === activeLayerId);
                            if (idx <= 0 || layers[idx - 1].type !== "draw") return _mergeLayerDown.apply(this, arguments);   // original explains why it can't
                            askConsent("Merge layers?", `"${layers[idx].name}" will be merged into "${layers[idx - 1].name}". You won't be able to separate them again.`,
                                () => _mergeLayerDown(), { okLabel: "Merge" });
                        };

                        // ---- trace image + text ----
                        const _removeRefImage = removeRefImage;
                        removeRefImage = function () {
                            if (!refState.loaded) return _removeRefImage.apply(this, arguments);
                            askConsent("Remove reference image?", "The tracing image is removed from this canvas. You'll need to upload it again to keep tracing.",
                                () => _removeRefImage(), { danger: true, okLabel: "Remove" });
                        };

                        const _removeSelectedOrAllText = removeSelectedOrAllText;
                        removeSelectedOrAllText = function () {
                            if (!selectedText && texts.length > 1) {
                                askConsent("Remove all text?", `${texts.length} text boxes will be removed.`,
                                    () => _removeSelectedOrAllText(), { danger: true, okLabel: "Remove all" });
                                return;
                            }
                            return _removeSelectedOrAllText.apply(this, arguments);
                        };

                        // ---- tile popup: save PNG / replay video (patched below in openModal) ----

                        // ---- radio: guard against double taps ----
                        const _toggleMusicConsent = toggleMusic;
                        toggleMusic = function () {
                            const ev = window.event;
                            const byUser = !!(ev && ev.isTrusted);           // sleep timer / native stop are not user taps
                            if (!musicPlaying) { _radioStartedAt = performance.now(); return _toggleMusicConsent.apply(this, arguments); }
                            if (byUser && performance.now() - _radioStartedAt < RADIO_DOUBLE_TAP_MS) {
                                askConsent("Stop the radio?", "You tapped twice in a row. Stop the live radio?",
                                    () => _toggleMusicConsent(), { danger: true, okLabel: "Stop radio" });
                                return;
                            }
                            return _toggleMusicConsent.apply(this, arguments);
                        };

                        const _toggleFavoriteConsent = toggleFavoriteRadio;
                        toggleFavoriteRadio = function (station, e) {
                            if (!station || !station.url) return _toggleFavoriteConsent.apply(this, arguments);
                            const removing = isStationFavorite(station.url);
                            const recent = performance.now() - (_favAt[station.url] || -1e9) < RADIO_DOUBLE_TAP_MS;
                            if (removing && recent) {
                                if (e && e.stopPropagation) e.stopPropagation();
                                askConsent("Remove from favorites?", `"${station.name}" was just starred. Remove it from your favorite stations?`,
                                    () => { _favAt[station.url] = performance.now(); _toggleFavoriteConsent(station, null); }, { danger: true, okLabel: "Remove" });
                                return;
                            }
                            _favAt[station.url] = performance.now();
                            return _toggleFavoriteConsent.apply(this, arguments);
                        };

                        // ---- seasonal master switch ----
                        function seasonsEnabled() { return lsGet("fw_seasons_on_v1", true) !== false; }
                        function syncSeasonCard() {
                            const box = document.getElementById("opt-seasons");
                            const card = document.getElementById("season-card");
                            if (box) box.checked = seasonsEnabled();
                            if (card) card.hidden = !seasonsEnabled();
                        }
                        function applySeasonsToggle(fromUser) {
                            const box = document.getElementById("opt-seasons");
                            if (box) lsSet("fw_seasons_on_v1", box.checked);
                            syncSeasonCard();
                            applySeasonalTheme();
                            if (fromUser) {
                                if (typeof haptic === "function") haptic(6);
                                showToast(seasonsEnabled() ? "Seasonal events on" : "Seasonal events off");
                            }
                        }
                        syncSeasonCard();

                        '''

html = ""; errors = []

def lit(old, new, count=1):
    global html
    n = html.count(old)
    if n != count: errors.append(f"literal x{count} found {n}: {old[:70]!r}"); return
    html = html.replace(old, new)

def rx(pat, new, count=1, flags=re.S):
    global html
    n = len(re.findall(pat, html, flags))
    if n != count: errors.append(f"regex x{count} found {n}: {pat[:70]!r}"); return
    html = re.sub(pat, (lambda m: new(m) if callable(new) else new), html, flags=flags)

NEEDED = ["saveStudioPNG", "saveWallPNG", "videoStudio", "deleteLayerById", "mergeLayerDown", "removeRefImage",
          "removeSelectedOrAllText", "toggleMusic", "toggleFavoriteRadio", "confirmCriticalAction", "cancelCriticalAction",
          "applySeasonalTheme", "getResolvedSeason"]

def apply_patches():
    if "function askConsent(" in html:
        errors.append("already applied"); return
    for fn in NEEDED:
        if f"function {fn}(" not in html:
            errors.append(f"missing function {fn}()")
    # seasonal card id + switch row + theme guard
    rx(r'<div class="card">(\s*<div class="card-head">Seasonal &amp; Holiday Theme</div>)',
       lambda m: '<div class="card" id="season-card">' + m.group(1))
    rx(r'(id="opt-borders"[^>]*></span>\s*</label>)', lambda m: m.group(1) + SEASON_ROW)
    lit("function getResolvedSeason() {", "function getResolvedSeason() {\n                            if (lsGet(\"fw_seasons_on_v1\", true) === false) return null;")
    # tile popup buttons
    lit('document.getElementById("modal-save-btn").onclick = () => exportStrokesPNG(mList, mName, mMeta);',
        'document.getElementById("modal-save-btn").onclick = () => askConsent("Save as PNG?", `Download ${mMeta.author}\'s drawing to this device as a PNG?`, () => exportStrokesPNG(mList, mName, mMeta), { okLabel: "Save PNG" });')
    lit('document.getElementById("modal-video-btn").onclick = () => exportReplayVideo(mList, mName, { meta: mMeta });',
        'document.getElementById("modal-video-btn").onclick = () => askConsent("Record replay video?", `Record ${mMeta.author}\'s drawing as a video and save it? This takes a few seconds.`, () => exportReplayVideo(mList, mName, { meta: mMeta }), { okLabel: "Record" });')
    lit("const APK_DOWNLOAD_URL", JS + "const APK_DOWNLOAD_URL")

def node_check(text):
    if not shutil.which("node"): print("node not found, skipping JS check"); return True
    ok = True
    for i, m in enumerate(re.finditer(r'<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>', text, re.S)):
        with tempfile.NamedTemporaryFile("w", suffix=".js", delete=False, encoding="utf-8") as f:
            f.write(m.group(1)); path = f.name
        r = subprocess.run(["node", "--check", path], capture_output=True, text=True, encoding="utf-8", errors="replace")
        if r.returncode: ok = False; print(f"JS syntax error in <script> #{i}:\n{r.stderr[:1000]}")
    return ok

def main():
    global html
    if len(sys.argv) < 2: print(__doc__); sys.exit(1)
    src = pathlib.Path(sys.argv[1])
    out = pathlib.Path(sys.argv[2]) if len(sys.argv) > 2 else src.with_name(src.stem + "_consent.html")
    html = src.read_text(encoding="utf-8").replace("\r\n", "\n")
    apply_patches()
    if errors:
        print("ABORTED, nothing written:"); [print("  -", e) for e in errors]; sys.exit(2)
    if not node_check(html): print("ABORTED: JS syntax error."); sys.exit(3)
    out.write_text(html, encoding="utf-8"); print(f"OK -> {out}")

if __name__ == "__main__": main()