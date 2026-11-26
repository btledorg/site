#!/usr/bin/env python3
"""
update_layers.py - adds a LAYER SYSTEM to freedomwall.html (THE ARTcher).

Usage:
    python update_layers.py freedomwall.html
    python update_layers.py freedomwall.html --dry-run     # report only
    python update_layers.py freedomwall.html --no-backup   # skip the backup copy
    python update_layers.py freedomwall.html --revert      # restore the backup

What you get
  * A new "Layers" tab in the Draw panel (between Style and Trace).
  * "Main" is the default canvas. Everything is drawn on the highlighted layer,
    so nothing changes until the user taps  + Draw layer.
  * Every text box is its own layer (add, select, hide, lock, reorder, rename, delete).
  * Draw layers and text layers share one stack, so a text can sit under a drawing.
  * Eraser and Fill only affect the layer they are used on.
  * Undo / Redo work per layer.
  * Posting, Save PNG, Share, Replay, Replay video, the wall, the leaderboard and
    the wall replay all understand layers.
  * Posts stay backward compatible: a drawing with a single layer is posted in the
    exact old format. Multi-layer drawings add a small "ly" tag on each item;
    older viewers still show them (they just ignore the tag).

Safe to re-run: injected blocks are replaced, never duplicated.
"""
import argparse
import re
import shutil
import sys
from pathlib import Path

CSS_ID = "artcher-layers"
JS_ID = "artcher-layers-js"

# --------------------------------------------------------------------------
# CSS
# --------------------------------------------------------------------------
CSS = r'''
/* ===== LAYERS: tabs ===== */
.sheet-tabs { grid-template-columns: repeat(5, 1fr); }
.sheet-tab { font-size: 11.5px; gap: 4px; padding: 0 2px; }
@media (orientation: landscape) and (min-width: 640px) {
    .sheet-tab svg { display: none; }
}

/* ===== LAYERS: text boxes are now composited onto the canvas in stack order.
   The DOM box is only visible while it is selected (being edited). ===== */
.text-box:not(.selected) { opacity: 0; }
.text-box.layer-hidden { display: none; }
.text-box.layer-locked { pointer-events: none; }

/* ===== LAYERS: canvas badge ===== */
.layer-badge {
    position: absolute; left: 8px; bottom: 8px; z-index: 7; pointer-events: none;
    max-width: calc(100% - 16px); padding: 3px 10px; border-radius: 999px;
    background: rgba(15, 23, 42, .82); color: #fff;
    font-size: 11px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

/* ===== LAYERS: panel ===== */
.ly-head { display: flex; gap: 8px; }
.ly-head .btn { flex: 1; }
.ly-hint { font-size: 11px; line-height: 1.4; color: var(--muted); }
.ly-list { display: flex; flex-direction: column; gap: 6px; }
.ly-row {
    display: flex; align-items: center; gap: 8px;
    padding: 6px 8px; border: 1px solid var(--border); border-radius: 12px;
    background: #fff; cursor: pointer;
}
.ly-row.active { border-color: var(--accent); background: var(--accent-soft); }
.ly-row.off .ly-name, .ly-row.off .ly-thumb { opacity: .45; }
.ly-eye {
    width: 30px; height: 30px; flex-shrink: 0; border: 0; border-radius: 8px;
    background: transparent; color: var(--ink); cursor: pointer;
    display: inline-flex; align-items: center; justify-content: center;
}
.ly-eye:active { background: #f1f5f9; }
.ly-eye svg { width: 17px; height: 17px; stroke: currentColor; fill: none; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.ly-thumb {
    width: 34px; height: 34px; flex-shrink: 0; overflow: hidden;
    border: 1px solid var(--border); border-radius: 8px; background: #fff;
    display: flex; align-items: center; justify-content: center;
    font-size: 15px; font-weight: 900; color: var(--muted);
}
.ly-thumb canvas { width: 100%; height: 100%; display: block; }
.ly-name { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.ly-name b { font-size: 13px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ly-name small { font-size: 10.5px; font-weight: 600; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ly-rename {
    flex: 1; min-width: 0; height: 32px; padding: 0 10px;
    border: 1px solid var(--accent); border-radius: 8px; outline: none;
    font: 700 13px 'Inter', sans-serif; color: var(--ink); background: #fff;
}
.ly-actions { display: flex; flex-wrap: wrap; gap: 6px; margin: -2px 0 4px; }
.ly-actions .btn { flex: 1; min-width: 52px; }
'''

# --------------------------------------------------------------------------
# HTML: tab button + pane
# --------------------------------------------------------------------------
TAB_BUTTON = r'''<button class="sheet-tab" data-pane="layers" role="tab" onclick="setDrawTab('layers')">
                                            <svg viewBox="0 0 24 24"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>Layers
                                        </button>
                                        '''

PANE = r'''<!-- LAYERS PANE -->
                                <div class="sheet-pane" id="pane-layers">
                                    <div class="ly-head">
                                        <button type="button" class="btn btn-primary btn-sm" onclick="addDrawLayer()">+ Draw layer</button>
                                        <button type="button" class="btn btn-sm" onclick="addTextLayer()">+ Text layer</button>
                                    </div>
                                    <div class="ly-hint">Drawing goes to the highlighted layer. Main is the default canvas, and every text is its own layer.</div>
                                    <div class="ly-list" id="layer-list"></div>
                                </div>

                                '''

# --------------------------------------------------------------------------
# JS
# --------------------------------------------------------------------------
JS = r'''
(function () {
    "use strict";

    // ------------------------------------------------------------------
    // keep the original implementations
    // ------------------------------------------------------------------
    const _rsi = renderStrokesInstant;
    const _anim = animateStrokes;
    const _brs = buildReplaySegments;
    const _drawText = drawTextItem;
    const _addText = addText;
    const _selectText = selectText;
    const _deselectText = deselectText;
    const _deleteTextItem = deleteTextItem;
    const _clearTexts = clearTexts;
    const _updateHistoryUI = updateHistoryUI;
    const _setDrawTab = setDrawTab;
    const _scheduleDraftSave = scheduleDraftSave;

    // ------------------------------------------------------------------
    // state
    // ------------------------------------------------------------------
    let seq = 0;
    const uid = (p) => p + (++seq) + "_" + Date.now().toString(36);
    let layers = [];            // bottom -> top (draw layers and text layers)
    let activeDrawId = null;    // draw layer that receives strokes
    let selectedLayerId = null; // highlighted layer (draw or text)
    let drawCount = 1;
    let renamingId = null;

    const byId = (id) => layers.find((L) => L.id === id);
    const activeDraw = () => byId(activeDrawId);
    const isLy = (s) => !!s && s.ly != null;

    function mkDraw(o) {
        return Object.assign({
            id: uid("d"), type: "draw", name: "", visible: true, locked: false, main: false,
            strokes: [], redo: [], cache: null, cctx: null, cacheCount: -1
        }, o || {});
    }
    function mkText(item, o) {
        return Object.assign({ id: uid("t"), type: "text", name: "", visible: true, locked: false, item: item }, o || {});
    }
    function layerCanvas(L) {
        if (!L.cache) {
            L.cache = document.createElement("canvas");
            L.cache.width = 500; L.cache.height = 500;
            L.cctx = L.cache.getContext("2d", { willReadFrequently: true });
            L.cacheCount = -1;
        }
        return L;
    }
    // `strokes` / `redoStack` are re-assigned by the original code (e.g. redoStack = []),
    // so always copy them back to the active layer before reading layer data.
    function syncActive() {
        const L = activeDraw();
        if (L) { L.strokes = strokes; L.redo = redoStack; }
    }
    function applyTextFlags(L) {
        const it = L.item;
        if (!it || !it.el) return;
        it.el.classList.toggle("layer-hidden", !L.visible);
        it.el.classList.toggle("layer-locked", !!L.locked);
        const c = it.content;
        if (c) {
            if (L.locked) c.contentEditable = "false";
            else {
                c.contentEditable = "plaintext-only";
                if (c.contentEditable !== "plaintext-only") c.contentEditable = "true";
            }
        }
    }
    function snippet(L) { return String((L.item && L.item.t) || "").replace(/\s+/g, " ").trim().slice(0, 16); }
    function labelOf(L) {
        if (L.name) return L.name;
        if (L.type === "text") { const s = snippet(L); return s ? "Text: " + s : "Text (empty)"; }
        return "Layer";
    }
    function insertAboveSelected(L) {
        const i = layers.findIndex((x) => x.id === selectedLayerId);
        layers.splice(i < 0 ? layers.length : i + 1, 0, L);
    }

    // ------------------------------------------------------------------
    // flatten for posting / export / replay
    // ------------------------------------------------------------------
    window.flattenLayers = function () {
        syncActive();
        const out = [];
        let z = 0;
        layers.forEach((L) => {
            if (!L.visible) return;
            if (L.type === "draw") {
                L.strokes.forEach((st) => out.push(Object.assign({}, st, { ly: z })));
            } else {
                const t = L.item;
                if (t && String(t.t || "").trim()) {
                    out.push({ k: "text", t: String(t.t).slice(0, 120), x: Math.round(t.x), y: Math.round(t.y),
                        c: t.c, f: t.f, fn: t.fn || "Inter", ly: z });
                }
            }
            z++;
        });
        const distinct = new Set(out.map((s) => s.ly));
        if (distinct.size <= 1) out.forEach((s) => { delete s.ly; });   // single layer: classic format
        return out;
    };

    window.serializeDraft = function () {
        syncActive();
        return {
            v: 2, bg: paperBg, strokes: [], texts: [],
            layers: layers.map((L) => L.type === "draw"
                ? { type: "draw", name: L.name, main: !!L.main, visible: L.visible, locked: L.locked, strokes: L.strokes }
                : { type: "text", name: L.name, visible: L.visible, locked: L.locked,
                    item: { t: L.item.t, x: L.item.x, y: L.item.y, c: L.item.c, f: L.item.f, fn: L.item.fn || "Inter" } })
        };
    };

    // ------------------------------------------------------------------
    // adopt what the original loadDraft() already created, or restore layers
    // ------------------------------------------------------------------
    function resetLayers() {
        const main = mkDraw({ name: "Main", main: true });
        layers = [main];
        activeDrawId = main.id;
        selectedLayerId = main.id;
        strokes = main.strokes;
        redoStack = main.redo;
        drawCount = 1;
    }

    function restoreLayers(saved) {
        _clearTexts();
        layers = [];
        saved.forEach((s) => {
            if (s && s.type === "draw") {
                layers.push(mkDraw({
                    name: s.name || "", main: !!s.main, visible: s.visible !== false, locked: !!s.locked,
                    strokes: Array.isArray(s.strokes) ? s.strokes : []
                }));
            } else if (s && s.type === "text" && s.item) {
                const item = _addText(Object.assign({}, s.item));
                const L = mkText(item, { name: s.name || "", visible: s.visible !== false, locked: !!s.locked });
                layers.push(L);
                applyTextFlags(L);
            }
        });
        if (!layers.some((L) => L.type === "draw")) layers.unshift(mkDraw({ name: "Main", main: true }));
        if (!layers.some((L) => L.main)) layers.find((L) => L.type === "draw").main = true;
        const act = layers.find((L) => L.main);
        activeDrawId = act.id;
        selectedLayerId = act.id;
        strokes = act.strokes;
        redoStack = act.redo;
        drawCount = Math.max(1, layers.filter((L) => L.type === "draw").length);
        _deselectText();
    }

    (function adopt() {
        const main = mkDraw({ name: "Main", main: true, strokes: strokes, redo: redoStack });
        layers = [main];
        activeDrawId = main.id;
        selectedLayerId = main.id;
        texts.forEach((item) => layers.push(mkText(item)));
        try {
            const d = lsGet(LS_DRAFT, null);
            if (d && Array.isArray(d.layers) && d.layers.length) restoreLayers(d.layers);
        } catch (e) { /* keep what the classic loader built */ }
    })();

    // ------------------------------------------------------------------
    // rendering: composite every layer onto the visible canvas
    // ------------------------------------------------------------------
    const liveCanvas = document.createElement("canvas");
    liveCanvas.width = 500; liveCanvas.height = 500;
    const liveCtx = liveCanvas.getContext("2d", { willReadFrequently: true });

    redrawStudio = function () {
        if (isPreviewing) return;
        syncActive();
        const act = activeDraw();
        const activeCount = (isDrawing && currentStroke) ? (1 + mirrorStrokes.length) : 0;
        drawCtx.clearRect(0, 0, 500, 500);

        for (const L of layers) {
            if (!L.visible) continue;

            if (L.type === "text") {
                if (selectedText && selectedText === L.item) continue;   // DOM box is showing it
                if (String(L.item.t || "").trim()) _drawText(drawCtx, L.item, 1);
                continue;
            }

            const isAct = L === act;
            const base = isAct ? Math.max(0, L.strokes.length - activeCount) : L.strokes.length;
            layerCanvas(L);
            if (L.cacheCount !== base) {
                _rsi(L.cctx, L.strokes.slice(0, base), 500, true);
                L.cacheCount = base;
            }
            if (isAct && activeCount > 0) {
                liveCtx.clearRect(0, 0, 500, 500);
                liveCtx.drawImage(L.cache, 0, 0);
                _rsi(liveCtx, L.strokes.slice(base), 500, false);
                drawCtx.drawImage(liveCanvas, 0, 0);
            } else {
                drawCtx.drawImage(L.cache, 0, 0);
            }
        }
    };

    // ---- layered static renderer (wall tiles, modal, export, leaderboard) ----
    const scratch = new Map();
    function scratchFor(dim) {
        let s = scratch.get(dim);
        if (!s) {
            const canvas = document.createElement("canvas");
            canvas.width = dim; canvas.height = dim;
            s = { canvas, ctx: canvas.getContext("2d", { willReadFrequently: true }) };
            scratch.set(dim, s);
        }
        return s;
    }
    function groupByLayer(list) {
        const map = new Map(), order = [];
        for (const st of list || []) {
            if (!st || st.k === "bg") continue;
            const k = st.ly == null ? -1 : st.ly;
            if (!map.has(k)) { map.set(k, []); order.push(k); }
            map.get(k).push(st);
        }
        return order.map((k) => ({ ly: k, items: map.get(k) }));
    }

    renderStrokesInstant = function (ctx, list, dim, clear) {
        if (clear === undefined) clear = true;
        if (!list || list.length < 2 || !list.some(isLy)) return _rsi(ctx, list, dim, clear);
        if (clear) ctx.clearRect(0, 0, dim, dim);
        const groups = groupByLayer(list);
        if (groups.length < 2) return _rsi(ctx, groups.length ? groups[0].items : [], dim, false);
        for (const g of groups) {
            const b = scratchFor(dim);
            _rsi(b.ctx, g.items, dim, true);
            ctx.drawImage(b.canvas, 0, 0);
        }
    };

    // ---- layered replays ----
    buildReplaySegments = function (list) {
        const out = [];
        for (const st of list || []) {
            for (const s of _brs([st])) {
                if (st && st.ly != null) s.ly = st.ly;
                out.push(s);
            }
        }
        return out;
    };

    function animateLayered(ctx, list, dim, speed, onDone) {
        const groups = groupByLayer(list);
        const bufs = groups.map(() => {
            const c = document.createElement("canvas");
            c.width = dim; c.height = dim;
            return c.getContext("2d", { willReadFrequently: true });
        });
        const segs = [];
        groups.forEach((g, gi) => {
            _brs(g.items).forEach((s) => { s._gi = gi; segs.push(s); });
        });
        ctx.clearRect(0, 0, dim, dim);
        if (!segs.length) { if (onDone) onDone(); return { cancel: () => {} }; }

        let idx = 0, raf = 0, cancelled = false;
        const per = Math.max(1, Math.ceil((segs.length / 95) * (speed || 1)));
        const composite = () => {
            ctx.clearRect(0, 0, dim, dim);
            bufs.forEach((b) => ctx.drawImage(b.canvas, 0, 0));
        };
        function step() {
            if (cancelled) return;
            const lim = Math.min(segs.length, idx + per);
            for (; idx < lim; idx++) drawSegmentBatch(bufs[segs[idx]._gi], segs, idx, idx + 1, dim);
            composite();
            if (idx < segs.length) raf = requestAnimationFrame(step);
            else if (onDone) onDone();
        }
        raf = requestAnimationFrame(step);
        return { cancel: () => { cancelled = true; if (raf) cancelAnimationFrame(raf); } };
    }

    animateStrokes = function (ctx, list, dim, speed, onDone) {
        if (!list || !list.some(isLy)) return _anim(ctx, list, dim, speed === undefined ? 1 : speed, onDone === undefined ? null : onDone);
        return animateLayered(ctx, list, dim, speed === undefined ? 1 : speed, onDone);
    };

    // called from the wall replay loop (patched call site)
    window.drawJobSegments = function (job, a, b, dim) {
        if (job._lay === undefined) job._lay = job.segments.some((s) => s.ly != null);
        if (!job._lay) return drawSegmentBatch(job.ctx, job.segments, a, b, dim);
        if (!job._bufs) {
            job._bufs = new Map(); job._order = [];
            job.segments.forEach((s) => {
                if (!job._bufs.has(s.ly)) {
                    const c = document.createElement("canvas");
                    c.width = dim; c.height = dim;
                    job._bufs.set(s.ly, c.getContext("2d", { willReadFrequently: true }));
                    job._order.push(s.ly);
                }
            });
        }
        for (let i = a; i < b; i++) drawSegmentBatch(job._bufs.get(job.segments[i].ly), job.segments, i, i + 1, dim);
        job.ctx.clearRect(0, 0, dim, dim);
        job._order.forEach((k) => job.ctx.drawImage(job._bufs.get(k).canvas, 0, 0));
    };

    // ------------------------------------------------------------------
    // badge on the canvas
    // ------------------------------------------------------------------
    const badge = document.createElement("div");
    badge.className = "layer-badge";
    badge.hidden = true;
    canvasFrame.appendChild(badge);

    function updateBadge() {
        const multi = layers.length > 1;
        badge.hidden = !multi;
        if (!multi) return;
        const sel = byId(selectedLayerId) || activeDraw();
        badge.textContent = (sel.type === "text" ? "Editing: " : "Drawing on: ") + labelOf(sel);
    }

    // ------------------------------------------------------------------
    // layer actions
    // ------------------------------------------------------------------
    function afterChange() {
        redrawStudio();
        updateHistoryUI();
        scheduleDraftSave();
        renderLayersPanel();
        updateBadge();
    }

    function activate(L) {
        syncActive();
        activeDrawId = L.id;
        strokes = L.strokes;
        redoStack = L.redo;
        selectedLayerId = L.id;
    }

    function selectLayer(id) {
        const L = byId(id);
        if (!L) return;
        if (L.type === "draw") {
            deselectText();
            activate(L);
        } else {
            if (L.visible && !L.locked) selectText(L.item);
            else { deselectText(); }
            selectedLayerId = L.id;
        }
        afterChange();
    }

    window.addDrawLayer = function () {
        syncActive();
        const L = mkDraw({ name: "Layer " + (++drawCount) });
        insertAboveSelected(L);
        deselectText();
        activate(L);
        afterChange();
        showToast(L.name + " added. Draw on it now.");
    };

    window.addTextLayer = function () {
        setDrawTab("layers");
        addText();
    };

    function toggleVisible(id) {
        const L = byId(id); if (!L) return;
        L.visible = !L.visible;
        if (L.type === "text") {
            applyTextFlags(L);
            if (!L.visible && selectedText === L.item) deselectText();
        }
        afterChange();
    }

    function toggleLock(id) {
        const L = byId(id); if (!L) return;
        L.locked = !L.locked;
        if (L.type === "text") {
            applyTextFlags(L);
            if (L.locked && selectedText === L.item) { deselectText(); selectedLayerId = L.id; }
        }
        afterChange();
        showToast(L.locked ? "Layer locked" : "Layer unlocked");
    }

    function moveLayer(id, dir) {
        const i = layers.findIndex((L) => L.id === id);
        const j = i + dir;
        if (i < 0 || j < 0 || j >= layers.length) return;
        const t = layers[i]; layers[i] = layers[j]; layers[j] = t;
        afterChange();
    }

    function deleteLayer(id) {
        const L = byId(id); if (!L) return;
        if (L.main) { showToast("Main is the default canvas and can't be deleted."); return; }
        if (L.type === "text") { deleteTextItem(L.item); return; }
        const doDelete = () => {
            syncActive();
            const idx = layers.indexOf(L);
            layers.splice(idx, 1);
            if (activeDrawId === L.id) {
                let next = null;
                for (let k = idx - 1; k >= 0 && !next; k--) if (layers[k].type === "draw") next = layers[k];
                for (let k = idx; k < layers.length && !next; k++) if (layers[k].type === "draw") next = layers[k];
                activate(next);
            }
            if (selectedLayerId === L.id) selectedLayerId = activeDrawId;
            afterChange();
        };
        if (L.strokes.length) {
            confirmCriticalAction("Delete this layer?", "\"" + labelOf(L) + "\" and its drawing will be removed.", doDelete);
        } else doDelete();
    }

    function startRename(L) {
        const list = document.getElementById("layer-list");
        const nameEl = list && list.querySelector(".ly-row.active .ly-name");
        if (!nameEl) return;
        renamingId = L.id;
        const inp = document.createElement("input");
        inp.className = "ly-rename";
        inp.maxLength = 20;
        inp.value = L.name || labelOf(L);
        nameEl.replaceWith(inp);
        inp.focus(); inp.select();
        let finished = false;
        const done = (save) => {
            if (finished) return;
            finished = true;
            if (save) L.name = inp.value.trim().slice(0, 20);
            renamingId = null;
            scheduleDraftSave();
            renderLayersPanel();
            updateBadge();
        };
        inp.addEventListener("keydown", (e) => {
            e.stopPropagation();
            if (e.key === "Enter") done(true);
            else if (e.key === "Escape") done(false);
        });
        inp.addEventListener("blur", () => done(true));
        inp.addEventListener("click", (e) => e.stopPropagation());
    }

    // ------------------------------------------------------------------
    // wrap the text functions so every text box owns a layer
    // ------------------------------------------------------------------
    addText = function (init) {
        const item = _addText(init);
        if (item && !layers.some((L) => L.item === item)) {
            const L = mkText(item);
            insertAboveSelected(L);
            selectedLayerId = L.id;
        }
        updateBadge();
        redrawStudio();
        refreshPanelSoon();
        return item;
    };

    selectText = function (item) {
        _selectText(item);
        const L = layers.find((x) => x.item === item);
        if (L) selectedLayerId = L.id;
        redrawStudio();
        updateBadge();
        refreshPanelSoon();
    };

    deselectText = function () {
        const had = selectedText;
        _deselectText();
        const sel = byId(selectedLayerId);
        if (sel && sel.type === "text") selectedLayerId = activeDrawId;
        if (had) redrawStudio();
        updateBadge();
        refreshPanelSoon();
    };

    deleteTextItem = function (item) {
        const L = layers.find((x) => x.item === item);
        if (L) {
            layers = layers.filter((x) => x !== L);
            if (selectedLayerId === L.id) selectedLayerId = activeDrawId;
        }
        _deleteTextItem(item);
        afterChange();
    };

    clearTexts = function () {
        layers = layers.filter((L) => L.type !== "text");
        if (!byId(selectedLayerId)) selectedLayerId = activeDrawId;
        _clearTexts();
        afterChange();
    };

    clearCanvas = function (confirmed) {
        if (isPreviewing) return;
        if (!confirmed) {
            syncActive();
            const has = layers.length > 1 || layers.some((L) => L.type === "draw" && L.strokes.length);
            if (!has) { showToast("Canvas is already clear."); return; }
            confirmCriticalAction(
                "Clear your canvas?",
                "This removes every layer, drawing and text on your canvas.",
                () => clearCanvas(true)
            );
            return;
        }
        _clearTexts();
        resetLayers();
        resetStudioZoom();
        redrawStudio();
        updateHistoryUI();
        updateBadge();
        renderLayersPanel();
        lsSet(LS_DRAFT, null);
    };

    updateHistoryUI = function () {
        _updateHistoryUI();
        const el = document.getElementById("studio-stats");
        if (el) {
            syncActive();
            const total = layers.reduce((n, L) => n + (L.type === "draw" ? L.strokes.length : 0), 0);
            el.textContent = total + (total === 1 ? " stroke" : " strokes") + " · " +
                layers.length + (layers.length === 1 ? " layer" : " layers") + " · " + wallEntries.length + " on wall";
        }
        refreshPanelSoon();
    };

    scheduleDraftSave = function () {
        _scheduleDraftSave();
        refreshPanelSoon();
    };

    setDrawTab = function (name) {
        _setDrawTab(name);
        if (name === "layers") { renderLayersPanel(); updateBadge(); }
    };

    // ------------------------------------------------------------------
    // block drawing on hidden / locked layers
    // ------------------------------------------------------------------
    const DRAW_TOOLS = ["brush", "eraser", "line", "rect", "circle", "fill"];
    function guard(e) {
        if (!DRAW_TOOLS.includes(currentTool)) return;
        if (e.touches ? e.touches.length >= 2 : (e.button !== 0 || spacePressed)) return;
        if (e.target && e.target.closest && e.target.closest(".text-box")) return;
        const L = activeDraw();
        if (!L || (L.visible && !L.locked)) return;
        e.stopImmediatePropagation();
        e.preventDefault();
        showToast(labelOf(L) + (L.locked ? " is locked" : " is hidden"));
    }
    canvasFrame.addEventListener("mousedown", guard, true);
    canvasFrame.addEventListener("touchstart", guard, { capture: true, passive: false });

    // ------------------------------------------------------------------
    // panel
    // ------------------------------------------------------------------
    const ICONS = {
        eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z"/><circle cx="12" cy="12" r="3"/>',
        eyeoff: '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>',
        lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
        unlock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>',
        up: '<polyline points="18 15 12 9 6 15"/>',
        down: '<polyline points="6 9 12 15 18 9"/>',
        trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
        pencil: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'
    };
    const svg = (n) => '<svg viewBox="0 0 24 24" aria-hidden="true">' + ICONS[n] + "</svg>";

    function mkBtn(cls, html, title, fn) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = cls;
        b.innerHTML = html;
        if (title) { b.title = title; b.setAttribute("aria-label", title); }
        b.addEventListener("click", (e) => { e.stopPropagation(); fn(); });
        return b;
    }

    function actionsFor(L) {
        const box = document.createElement("div");
        box.className = "ly-actions";
        box.appendChild(mkBtn("btn btn-sm", svg("pencil") + "Rename", "Rename layer", () => startRename(L)));
        box.appendChild(mkBtn("btn btn-sm", svg(L.locked ? "unlock" : "lock") + (L.locked ? "Unlock" : "Lock"),
            L.locked ? "Unlock layer" : "Lock layer", () => toggleLock(L.id)));
        box.appendChild(mkBtn("btn btn-sm", svg("up"), "Move layer up", () => moveLayer(L.id, 1)));
        box.appendChild(mkBtn("btn btn-sm", svg("down"), "Move layer down", () => moveLayer(L.id, -1)));
        const del = mkBtn("btn btn-sm btn-danger", svg("trash"), "Delete layer", () => deleteLayer(L.id));
        if (L.main) del.disabled = true;
        box.appendChild(del);
        return box;
    }

    function renderLayersPanel() {
        const list = document.getElementById("layer-list");
        if (!list || renamingId) return;
        syncActive();
        list.replaceChildren();

        for (let i = layers.length - 1; i >= 0; i--) {
            const L = layers[i];
            const row = document.createElement("div");
            row.className = "ly-row" + (L.id === selectedLayerId ? " active" : "") + (L.visible ? "" : " off");
            row.setAttribute("role", "button");
            row.tabIndex = 0;

            const eye = mkBtn("ly-eye", svg(L.visible ? "eye" : "eyeoff"),
                L.visible ? "Hide layer" : "Show layer", () => toggleVisible(L.id));

            const thumb = document.createElement("span");
            thumb.className = "ly-thumb";
            if (L.type === "draw") {
                layerCanvas(L);
                if (L.cacheCount !== L.strokes.length && !isDrawing) {
                    _rsi(L.cctx, L.strokes, 500, true);
                    L.cacheCount = L.strokes.length;
                }
                const cv = document.createElement("canvas");
                cv.width = 64; cv.height = 64;
                cv.getContext("2d").drawImage(L.cache, 0, 0, 64, 64);
                thumb.appendChild(cv);
            } else {
                thumb.textContent = "T";
                thumb.style.color = (L.item && L.item.c) || "";
            }

            const nameEl = document.createElement("span");
            nameEl.className = "ly-name";
            const b = document.createElement("b");
            b.textContent = labelOf(L);
            const s = document.createElement("small");
            let sub = L.type === "text"
                ? "Text"
                : (L.main ? "Main canvas" : "Drawing") + " · " + L.strokes.length + (L.strokes.length === 1 ? " stroke" : " strokes");
            if (L.locked) sub += " · Locked";
            if (!L.visible) sub += " · Hidden";
            s.textContent = sub;
            nameEl.append(b, s);

            row.append(eye, thumb, nameEl);
            row.addEventListener("click", () => selectLayer(L.id));
            row.addEventListener("keydown", (e) => {
                if (e.key === "Enter" || e.key === " ") { e.preventDefault(); selectLayer(L.id); }
            });
            list.appendChild(row);
            if (L.id === selectedLayerId) list.appendChild(actionsFor(L));
        }
    }

    let panelTimer = 0;
    function refreshPanelSoon() {
        clearTimeout(panelTimer);
        panelTimer = setTimeout(() => {
            updateBadge();
            const pane = document.getElementById("pane-layers");
            if (pane && pane.classList.contains("active") && !isDrawing) renderLayersPanel();
        }, 90);
    }

    // ------------------------------------------------------------------
    // go
    // ------------------------------------------------------------------
    if (document.fonts) {
        if (document.fonts.ready) document.fonts.ready.then(() => redrawStudio());
        if (document.fonts.addEventListener) document.fonts.addEventListener("loadingdone", () => redrawStudio());
    }
    redrawStudio();
    updateHistoryUI();
    updateBadge();
    renderLayersPanel();
})();
'''

# --------------------------------------------------------------------------
# helpers
# --------------------------------------------------------------------------

def rx_block(tag, ident):
    return re.compile(r'[ \t]*<%s id="%s"[^>]*>.*?</%s>[ \t]*\r?\n?' % (tag, re.escape(ident), tag), re.S)


def main():
    ap = argparse.ArgumentParser(description="Add a layer system to freedomwall.html")
    ap.add_argument("file")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--no-backup", action="store_true")
    ap.add_argument("--revert", action="store_true", help="restore <file>.layers.bak and exit")
    args = ap.parse_args()

    path = Path(args.file)
    bak = path.with_name(path.name + ".layers.bak")

    if args.revert:
        if not bak.is_file():
            sys.exit("No backup found: %s" % bak)
        shutil.copy2(bak, path)
        print("Restored original from %s" % bak)
        return

    if not path.is_file():
        sys.exit("File not found: %s" % path)

    with open(path, "r", encoding="utf-8", newline="") as f:
        text = f.read()

    nl = "\r\n" if "\r\n" in text else "\n"
    fix = lambda s: s.replace("\r\n", "\n").replace("\n", nl)

    report = []
    failed = False

    def log(label, status):
        nonlocal failed
        if status == "NOT FOUND":
            failed = True
        report.append((label, status))

    def literal(label, old, new):
        nonlocal text
        old, new = fix(old), fix(new)
        if new in text:
            log(label, "already applied")
        elif old in text:
            text = text.replace(old, new, 1)
            log(label, "applied")
        else:
            log(label, "NOT FOUND")

    # 1. draft saving understands layers
    literal(
        "draft auto-save stores layers",
        'lsSet(LS_DRAFT, { strokes, texts: getTextItems(), bg: paperBg });',
        'lsSet(LS_DRAFT, typeof serializeDraft === "function" ? serializeDraft() : { strokes, texts: getTextItems(), bg: paperBg });',
    )

    # 2. post / export / replay / share read every layer
    old = "strokes.concat(getTextItems())"
    n = text.count(old)
    if n:
        text = text.replace(old, "flattenLayers()")
        log("post / export / replay use all layers (%d places)" % n, "applied")
    elif "flattenLayers()" in text:
        log("post / export / replay use all layers", "already applied")
    else:
        log("post / export / replay use all layers", "NOT FOUND")

    # 3. wall replay understands layers
    literal(
        "wall replay draws layered tiles",
        "drawSegmentBatch(job.ctx, job.segments, job.idx, nextIdx, dim);",
        "drawJobSegments(job, job.idx, nextIdx, dim);",
    )

    # 4. Layers tab button
    tab_anchor = '''<button class="sheet-tab" data-pane="ref" role="tab" onclick="setDrawTab('ref')">'''
    if 'data-pane="layers"' in text:
        log("Layers tab button", "already applied")
    elif tab_anchor in text:
        text = text.replace(tab_anchor, fix(TAB_BUTTON) + tab_anchor, 1)
        log("Layers tab button", "applied")
    else:
        log("Layers tab button", "NOT FOUND")

    # 5. Layers pane
    pane_anchor = "<!-- TRACE / REFERENCE IMAGE PANE -->"
    if 'id="pane-layers"' in text:
        log("Layers pane", "already applied")
    elif pane_anchor in text:
        text = text.replace(pane_anchor, fix(PANE) + pane_anchor, 1)
        log("Layers pane", "applied")
    else:
        log("Layers pane", "NOT FOUND")

    # 6. stylesheet (replace if present)
    css_rx = rx_block("style", CSS_ID)
    had = bool(css_rx.search(text))
    text = css_rx.sub("", text)
    if "</head>" in text:
        text = text.replace("</head>", fix('<style id="%s">%s</style>\n' % (CSS_ID, CSS)) + "</head>", 1)
        log("layers stylesheet", "updated" if had else "applied")
    else:
        log("layers stylesheet", "NOT FOUND")

    # 7. script (replace if present). Must come last so it wraps everything else.
    js_rx = rx_block("script", JS_ID)
    had = bool(js_rx.search(text))
    text = js_rx.sub("", text)
    if "</body>" in text:
        idx = text.rfind("</body>")
        text = text[:idx] + fix('<script id="%s">%s</script>\n' % (JS_ID, JS)) + text[idx:]
        log("layers script", "updated" if had else "applied")
    else:
        log("layers script", "NOT FOUND")

    width = max(len(l) for l, _ in report)
    for label, status in report:
        mark = {"applied": "+", "updated": "~", "already applied": "=", "NOT FOUND": "!"}[status]
        print(" [%s] %s  %s" % (mark, label.ljust(width), status))

    if args.dry_run:
        print("\nDry run, nothing written.")
        return

    if not args.no_backup and not bak.exists():
        shutil.copy2(path, bak)
        print("\nBackup saved: %s" % bak)

    with open(path, "w", encoding="utf-8", newline="") as f:
        f.write(text)
    print("Updated: %s" % path)

    if failed:
        print("\nSome edits were NOT FOUND (marked [!]). Layers will not work correctly until they all apply.")
        sys.exit(1)


if __name__ == "__main__":
    main()