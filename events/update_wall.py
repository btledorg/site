import sys
import shutil
from pathlib import Path


def replace_exact(content: str, old: str, new: str, label: str) -> str:
    count = content.count(old)
    if count == 0:
        raise RuntimeError(f"Patch failed: could not find block for [{label}]")
    if count > 1:
        raise RuntimeError(f"Patch failed: matched [{label}] {count} times (expected 1)")
    return content.replace(old, new, 1)


def main():
    target = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("freedomwall.html")
    if not target.exists():
        print(f"Error: {target} not found.")
        sys.exit(1)

    backup = target.with_suffix(target.suffix + ".layers.bak")
    shutil.copy2(target, backup)
    text = target.read_text(encoding="utf-8")

    # 1. CSS for Ibis Paint-style Layers Drawer & Layer Rows
    old_css = """        .sheet-tabs { display: grid; grid-template-columns: repeat(4, 1fr); background: var(--soft); border-bottom: 1px solid var(--border); }"""
    new_css = """        .sheet-tabs { display: grid; grid-template-columns: repeat(5, 1fr); background: var(--soft); border-bottom: 1px solid var(--border); }
        .layer-list { display: flex; flex-direction: column; gap: 6px; max-height: 185px; overflow-y: auto; padding-right: 2px; }
        .layer-row {
            display: flex; align-items: center; gap: 7px; padding: 6px 8px;
            border: 1.5px solid var(--border); border-radius: 10px; background: #fff;
            cursor: pointer; transition: border-color .12s, background .12s;
        }
        .layer-row.active { border-color: var(--accent); background: var(--accent-soft); }
        .layer-row.is-hidden { opacity: 0.52; }
        .layer-thumb {
            width: 34px; height: 34px; border-radius: 7px; border: 1px solid var(--border);
            background-color: #fff;
            background-image: radial-gradient(#cbd5e1 1px, transparent 1px);
            background-size: 6px 6px;
            display: flex; align-items: center; justify-content: center;
            font-weight: 800; font-size: 13px; color: var(--ink); flex-shrink: 0; overflow: hidden;
        }
        .layer-thumb canvas { width: 100%; height: 100%; display: block; }
        .layer-meta { flex: 1; min-width: 0; display: flex; flex-direction: column; }
        .layer-name { font-size: 12px; font-weight: 700; color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .layer-sub { font-size: 10px; color: var(--muted); font-weight: 600; }
        .layer-actions { display: flex; align-items: center; gap: 3px; flex-shrink: 0; }
        .layer-ico-btn {
            width: 28px; height: 28px; border-radius: 7px; border: 1px solid var(--border);
            background: #fff; color: var(--ink); display: inline-flex; align-items: center;
            justify-content: center; cursor: pointer; font-size: 12px; font-weight: 700; padding: 0;
        }
        .layer-ico-btn:active { background: #f1f5f9; }
        .layer-ico-btn.off { color: var(--muted); background: var(--soft); }
        .layer-ico-btn.del { color: var(--d-red); }"""
    text = replace_exact(text, old_css, new_css, "CSS Layers Panel & 5-Tab Grid")

    # 2. HTML: Add Layers tab & pane inside .sheet
    old_tabs = """                                        <button class="sheet-tab" data-pane="text" role="tab" onclick="setDrawTab('text')">
                                            <svg viewBox="0 0 24 24"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>Text
                                        </button>
                                        <button class="sheet-tab" data-pane="post" role="tab" onclick="setDrawTab('post')">
                                            <svg viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>Post
                                        </button>"""
    new_tabs = """                                        <button class="sheet-tab" data-pane="text" role="tab" onclick="setDrawTab('text')">
                                            <svg viewBox="0 0 24 24"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>Text
                                        </button>
                                        <button class="sheet-tab" data-pane="layers" role="tab" onclick="setDrawTab('layers'); renderLayersPanel();">
                                            <svg viewBox="0 0 24 24"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>Layers
                                        </button>
                                        <button class="sheet-tab" data-pane="post" role="tab" onclick="setDrawTab('post')">
                                            <svg viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>Post
                                        </button>"""
    text = replace_exact(text, old_tabs, new_tabs, "HTML Layers Tab")

    old_post_pane = """                                <!-- POST PANE -->"""
    new_layers_pane = """                                <!-- LAYERS PANE (IBIS PAINT STYLE) -->
                                <div class="sheet-pane" id="pane-layers">
                                    <div class="row-between">
                                        <div style="display:flex;gap:6px;">
                                            <button type="button" class="btn btn-sm btn-primary" onclick="addDrawLayer()">+ Draw Layer</button>
                                            <button type="button" class="btn btn-sm" onclick="addText()">+ Text Layer</button>
                                        </div>
                                        <button type="button" class="btn btn-sm" onclick="mergeLayerDown()" title="Merge active layer down">Merge ↓</button>
                                    </div>
                                    <div class="layer-list" id="layer-list"></div>
                                </div>
                                
                                <!-- POST PANE -->"""
    text = replace_exact(text, old_post_pane, new_layers_pane, "HTML Layers Pane")

    # 3. JS: Multi-layer state, active layer proxy, and draft persistence
    old_strokes_decl = """                        let strokes = [];
                        let redoStack = [];"""
    new_layers_state = """                        let layers = [
                            { id: "layer_base", name: "Layer 1", type: "draw", visible: true, strokes: [], redoStack: [] }
                        ];
                        let activeLayerId = "layer_base";
                        let layerCounter = 1;

                        function getActiveDrawLayer() {
                            let lyr = layers.find(l => l.id === activeLayerId && l.type === "draw");
                            if (!lyr) {
                                lyr = layers.find(l => l.type === "draw");
                                if (!lyr) {
                                    layerCounter++;
                                    lyr = { id: "layer_" + Date.now(), name: "Layer " + layerCounter, type: "draw", visible: true, strokes: [], redoStack: [] };
                                    layers.unshift(lyr);
                                }
                                activeLayerId = lyr.id;
                            }
                            return lyr;
                        }

                        function getAllFlattenedStrokes(includeHidden = false) {
                            const out = [];
                            for (const lyr of layers) {
                                if (!includeHidden && !lyr.visible) continue;
                                if (lyr.type === "draw") {
                                    out.push(...lyr.strokes);
                                } else if (lyr.type === "text" && lyr.textItem && (lyr.textItem.t || "").trim()) {
                                    out.push({
                                        k: "text",
                                        t: lyr.textItem.t.slice(0, 120),
                                        x: Math.round(lyr.textItem.x),
                                        y: Math.round(lyr.textItem.y),
                                        c: lyr.textItem.c,
                                        f: lyr.textItem.f,
                                        fn: lyr.textItem.fn || "Inter"
                                    });
                                }
                            }
                            return out;
                        }

                        Object.defineProperty(window, "strokes", {
                            get() { return getActiveDrawLayer().strokes; },
                            set(v) { getActiveDrawLayer().strokes = Array.isArray(v) ? v : []; }
                        });
                        Object.defineProperty(window, "redoStack", {
                            get() { return getActiveDrawLayer().redoStack; },
                            set(v) { getActiveDrawLayer().redoStack = Array.isArray(v) ? v : []; }
                        });"""
    text = replace_exact(text, old_strokes_decl, new_layers_state, "JS Multi-layer State & Proxies")

    # 4. JS: Draft Save & Load with Multi-layer support
    old_draft = """                        let draftSaveTimer = null;
                        function scheduleDraftSave() {
                            clearTimeout(draftSaveTimer);
                            draftSaveTimer = setTimeout(() => {
                                lsSet(LS_DRAFT, { strokes, texts: getTextItems(), bg: paperBg });
                            }, 350);
                        }
                        
                        function loadDraft() {
                            const draft = lsGet(LS_DRAFT, null);
                            if (draft && draft.bg) setPaper(draft.bg, true);
                            if (!draft) return;
                            if (Array.isArray(draft.strokes) && draft.strokes.length > 0) {
                                strokes = draft.strokes;
                                redrawStudio();
                            }
                            if (Array.isArray(draft.texts) && draft.texts.length > 0) {
                                draft.texts.forEach(t => addText(t));
                                deselectText();
                            }
                            updateHistoryUI();
                        }"""
    new_draft = """                        let draftSaveTimer = null;
                        function scheduleDraftSave() {
                            clearTimeout(draftSaveTimer);
                            draftSaveTimer = setTimeout(() => {
                                const serializedLayers = layers.map(l => {
                                    if (l.type === "draw") {
                                        return { id: l.id, name: l.name, type: "draw", visible: l.visible, strokes: l.strokes };
                                    }
                                    const t = l.textItem;
                                    return {
                                        id: l.id, name: l.name, type: "text", visible: l.visible,
                                        text: t ? { id: t.id, t: t.t, x: t.x, y: t.y, c: t.c, f: t.f, fn: t.fn } : null
                                    };
                                });
                                lsSet(LS_DRAFT, { layers: serializedLayers, activeLayerId, bg: paperBg });
                            }, 350);
                        }
                        
                        function loadDraft() {
                            const draft = lsGet(LS_DRAFT, null);
                            if (draft && draft.bg) setPaper(draft.bg, true);
                            if (!draft) { renderLayersPanel(); return; }
                            if (Array.isArray(draft.layers) && draft.layers.length > 0) {
                                layers = [];
                                draft.layers.forEach((dl, idx) => {
                                    if (dl.type === "draw") {
                                        layers.push({
                                            id: dl.id || ("layer_" + idx),
                                            name: dl.name || ("Layer " + (idx + 1)),
                                            type: "draw",
                                            visible: dl.visible !== false,
                                            strokes: Array.isArray(dl.strokes) ? dl.strokes : [],
                                            redoStack: []
                                        });
                                        layerCounter = Math.max(layerCounter, idx + 1);
                                    } else if (dl.type === "text" && dl.text) {
                                        const item = addText(dl.text, true);
                                        const lyr = layers.find(x => x.textItem === item);
                                        if (lyr) {
                                            lyr.id = dl.id || lyr.id;
                                            lyr.name = dl.name || lyr.name;
                                            lyr.visible = dl.visible !== false;
                                            item.el.style.display = lyr.visible ? "" : "none";
                                        }
                                    }
                                });
                                if (!layers.some(l => l.type === "draw")) {
                                    layers.unshift({ id: "layer_base", name: "Layer 1", type: "draw", visible: true, strokes: [], redoStack: [] });
                                }
                                activeLayerId = draft.activeLayerId || layers[0].id;
                                syncTextLayerZOrder();
                                deselectText();
                                redrawStudio();
                            } else {
                                if (Array.isArray(draft.strokes) && draft.strokes.length > 0) {
                                    strokes = draft.strokes;
                                    redrawStudio();
                                }
                                if (Array.isArray(draft.texts) && draft.texts.length > 0) {
                                    draft.texts.forEach(t => addText(t, true));
                                    deselectText();
                                }
                            }
                            updateHistoryUI();
                            renderLayersPanel();
                        }"""
    text = replace_exact(text, old_draft, new_draft, "JS Draft Save & Load for Layers")

    # 5. JS: Force Hand tool in addText(), link text boxes to layers, and add Layer UI controls
    old_delete_text = """                        function deleteTextItem(item) {
                            if (!item) return;
                            texts = texts.filter(t => t !== item);
                            item.el.remove();
                            if (selectedText === item) selectedText = null;
                            scheduleDraftSave();
                        }"""
    new_delete_text = """                        function deleteTextItem(item) {
                            if (!item) return;
                            texts = texts.filter(t => t !== item);
                            layers = layers.filter(l => l.textItem !== item);
                            item.el.remove();
                            if (selectedText === item) selectedText = null;
                            renderLayersPanel();
                            scheduleDraftSave();
                        }"""
    text = replace_exact(text, old_delete_text, new_delete_text, "JS deleteTextItem sync with layers")

    old_add_text_sig = """                        function addText(init) {
                            syncUnit();
                            if (currentTool === "eraser") setTool("hand");"""
    new_add_text_sig = """                        function addText(init, skipToolSwitch = false) {
                            syncUnit();
                            if (!skipToolSwitch) setTool("hand");"""
    text = replace_exact(text, old_add_text_sig, new_add_text_sig, "JS addText auto-switch to Hand tool")

    old_add_text_end = """                            selectText(item);
                            if (!init) setTimeout(() => content.focus(), 0);
                            return item;
                        }"""
    new_add_text_end = """                            const textLayerObj = {
                                id: "tlayer_" + item.id,
                                name: (item.t || "").trim() ? `Text: ${item.t.trim().slice(0, 14)}` : `Text ${texts.length}`,
                                type: "text",
                                visible: true,
                                textItem: item
                            };
                            layers.push(textLayerObj);
                            if (!skipToolSwitch) activeLayerId = textLayerObj.id;
                            syncTextLayerZOrder();
                            renderLayersPanel();

                            selectText(item);
                            if (!init) setTimeout(() => content.focus(), 0);
                            return item;
                        }"""
    text = replace_exact(text, old_add_text_end, new_add_text_end, "JS register text box in layers")

    old_content_input = """                            content.addEventListener("input", () => {
                                item.t = (content.innerText || "").replace(/\\n+$/, "");
                                scheduleDraftSave();
                            });"""
    new_content_input = """                            content.addEventListener("input", () => {
                                item.t = (content.innerText || "").replace(/\\n+$/, "");
                                const lyr = layers.find(l => l.textItem === item);
                                if (lyr) lyr.name = item.t.trim() ? `Text: ${item.t.trim().slice(0, 14)}` : "Text Layer";
                                renderLayersPanel();
                                scheduleDraftSave();
                            });"""
    text = replace_exact(text, old_content_input, new_content_input, "JS update text layer name on input")

    # 6. JS: Render visible layers in proper stack order & Layer management functions
    old_committed = """                        function rebuildCommittedLayer() {
                            const activeCount = isDrawing && currentStroke ? (1 + mirrorStrokes.length) : 0;
                            const baseCount = Math.max(0, strokes.length - activeCount);
                            renderStrokesInstant(committedCtx, strokes.slice(0, baseCount), 500, true);
                            committedCount = baseCount;
                        }
                        
                        function redrawStudio() {
                            const activeCount = isDrawing && currentStroke ? (1 + mirrorStrokes.length) : 0;
                            const baseCount = Math.max(0, strokes.length - activeCount);
                            if (committedCount !== baseCount) rebuildCommittedLayer();
                            
                            drawCtx.clearRect(0, 0, 500, 500);
                            drawCtx.drawImage(committedCanvas, 0, 0);
                            if (activeCount > 0) {
                                renderStrokesInstant(drawCtx, strokes.slice(baseCount), 500, false);
                            }
                        }"""
    new_committed = """                        const layerScratchCanvas = document.createElement("canvas");
                        layerScratchCanvas.width = 500;
                        layerScratchCanvas.height = 500;
                        const layerScratchCtx = layerScratchCanvas.getContext("2d", { willReadFrequently: true });

                        function syncTextLayerZOrder() {
                            layers.forEach((lyr, idx) => {
                                if (lyr.type === "text" && lyr.textItem && lyr.textItem.el) {
                                    lyr.textItem.el.style.zIndex = String(10 + idx);
                                    lyr.textItem.el.style.display = lyr.visible ? "" : "none";
                                }
                            });
                        }

                        function rebuildCommittedLayer() {
                            committedCtx.clearRect(0, 0, 500, 500);
                            const activeDraw = getActiveDrawLayer();
                            const activeCount = isDrawing && currentStroke ? (1 + mirrorStrokes.length) : 0;
                            for (const lyr of layers) {
                                if (!lyr.visible || lyr.type !== "draw") continue;
                                const list = (lyr === activeDraw && activeCount > 0)
                                    ? lyr.strokes.slice(0, Math.max(0, lyr.strokes.length - activeCount))
                                    : lyr.strokes;
                                if (!list.length) continue;
                                renderStrokesInstant(layerScratchCtx, list, 500, true);
                                committedCtx.drawImage(layerScratchCanvas, 0, 0);
                            }
                            committedCount = activeDraw.strokes.length - activeCount;
                        }
                        
                        function redrawStudio() {
                            rebuildCommittedLayer();
                            drawCtx.clearRect(0, 0, 500, 500);
                            drawCtx.drawImage(committedCanvas, 0, 0);
                            const activeDraw = getActiveDrawLayer();
                            const activeCount = isDrawing && currentStroke ? (1 + mirrorStrokes.length) : 0;
                            if (activeDraw.visible && activeCount > 0) {
                                renderStrokesInstant(layerScratchCtx, activeDraw.strokes.slice(-activeCount), 500, true);
                                drawCtx.drawImage(layerScratchCanvas, 0, 0);
                            }
                            if (document.getElementById("pane-layers")?.classList.contains("active")) {
                                renderLayersPanel();
                            }
                        }

                        function addDrawLayer() {
                            layerCounter++;
                            const id = "layer_" + Date.now() + "_" + Math.random().toString(36).slice(2, 5);
                            const newLyr = { id, name: "Layer " + layerCounter, type: "draw", visible: true, strokes: [], redoStack: [] };
                            const idx = layers.findIndex(l => l.id === activeLayerId);
                            if (idx >= 0) layers.splice(idx + 1, 0, newLyr);
                            else layers.push(newLyr);
                            activeLayerId = id;
                            deselectText();
                            if (currentTool === "hand") setTool("brush");
                            syncTextLayerZOrder();
                            renderLayersPanel();
                            updateHistoryUI();
                            scheduleDraftSave();
                            haptic(8);
                            showToast("Added " + newLyr.name);
                        }

                        function selectLayer(id) {
                            const lyr = layers.find(l => l.id === id);
                            if (!lyr) return;
                            activeLayerId = id;
                            if (lyr.type === "text" && lyr.textItem) {
                                setTool("hand");
                                selectText(lyr.textItem);
                            } else {
                                deselectText();
                            }
                            renderLayersPanel();
                            updateHistoryUI();
                            haptic(6);
                        }

                        function toggleLayerVisibility(id, e) {
                            if (e) e.stopPropagation();
                            const lyr = layers.find(l => l.id === id);
                            if (!lyr) return;
                            lyr.visible = !lyr.visible;
                            if (lyr.type === "text" && lyr.textItem) {
                                lyr.textItem.el.style.display = lyr.visible ? "" : "none";
                                if (!lyr.visible && selectedText === lyr.textItem) deselectText();
                            }
                            redrawStudio();
                            renderLayersPanel();
                            scheduleDraftSave();
                            haptic(6);
                        }

                        function moveLayerOrder(id, dir, e) {
                            if (e) e.stopPropagation();
                            const idx = layers.findIndex(l => l.id === id);
                            const targetIdx = idx + dir;
                            if (idx < 0 || targetIdx < 0 || targetIdx >= layers.length) return;
                            const [moved] = layers.splice(idx, 1);
                            layers.splice(targetIdx, 0, moved);
                            syncTextLayerZOrder();
                            redrawStudio();
                            renderLayersPanel();
                            scheduleDraftSave();
                            haptic(6);
                        }

                        function deleteLayerById(id, e) {
                            if (e) e.stopPropagation();
                            const idx = layers.findIndex(l => l.id === id);
                            if (idx < 0) return;
                            const lyr = layers[idx];
                            if (lyr.type === "text" && lyr.textItem) {
                                deleteTextItem(lyr.textItem);
                                return;
                            }
                            const drawLayers = layers.filter(l => l.type === "draw");
                            if (drawLayers.length <= 1) {
                                lyr.strokes = [];
                                lyr.redoStack = [];
                                redrawStudio();
                                updateHistoryUI();
                                renderLayersPanel();
                                scheduleDraftSave();
                                showToast("Cleared base layer");
                                return;
                            }
                            layers.splice(idx, 1);
                            if (activeLayerId === id) {
                                const fallback = layers[Math.max(0, idx - 1)] || layers[0];
                                activeLayerId = fallback.id;
                            }
                            redrawStudio();
                            updateHistoryUI();
                            renderLayersPanel();
                            scheduleDraftSave();
                            haptic(8);
                            showToast("Deleted " + lyr.name);
                        }

                        function mergeLayerDown() {
                            const idx = layers.findIndex(l => l.id === activeLayerId);
                            if (idx <= 0) { showToast("No layer below to merge into"); return; }
                            const top = layers[idx];
                            const below = layers[idx - 1];
                            if (below.type !== "draw") { showToast("Can only merge onto a drawing layer"); return; }
                            if (top.type === "draw") {
                                below.strokes.push(...top.strokes);
                            } else if (top.type === "text" && top.textItem) {
                                if ((top.textItem.t || "").trim()) {
                                    below.strokes.push({
                                        k: "text",
                                        t: top.textItem.t.slice(0, 120),
                                        x: Math.round(top.textItem.x),
                                        y: Math.round(top.textItem.y),
                                        c: top.textItem.c,
                                        f: top.textItem.f,
                                        fn: top.textItem.fn || "Inter"
                                    });
                                }
                                texts = texts.filter(t => t !== top.textItem);
                                top.textItem.el.remove();
                            }
                            layers.splice(idx, 1);
                            activeLayerId = below.id;
                            redrawStudio();
                            updateHistoryUI();
                            renderLayersPanel();
                            scheduleDraftSave();
                            haptic(10);
                            showToast("Merged into " + below.name);
                        }

                        function renderLayersPanel() {
                            const list = document.getElementById("layer-list");
                            if (!list) return;
                            list.replaceChildren();
                            // Display top-most layer at the top (Ibis Paint convention)
                            for (let i = layers.length - 1; i >= 0; i--) {
                                const lyr = layers[i];
                                const row = document.createElement("div");
                                row.className = "layer-row" + (lyr.id === activeLayerId ? " active" : "") + (!lyr.visible ? " is-hidden" : "");
                                row.onclick = () => selectLayer(lyr.id);

                                const thumb = document.createElement("div");
                                thumb.className = "layer-thumb";
                                if (lyr.type === "text") {
                                    thumb.textContent = "T";
                                    if (lyr.textItem) thumb.style.color = lyr.textItem.c;
                                } else {
                                    const cv = document.createElement("canvas");
                                    cv.width = cv.height = 68;
                                    renderStrokesInstant(cv.getContext("2d"), lyr.strokes, 68, true);
                                    thumb.appendChild(cv);
                                }

                                const meta = document.createElement("div");
                                meta.className = "layer-meta";
                                const nm = document.createElement("div");
                                nm.className = "layer-name";
                                nm.textContent = lyr.name;
                                const sub = document.createElement("div");
                                sub.className = "layer-sub";
                                sub.textContent = lyr.type === "text"
                                    ? "Text Layer"
                                    : `${lyr.strokes.length} stroke${lyr.strokes.length === 1 ? "" : "s"}`;
                                meta.append(nm, sub);

                                const acts = document.createElement("div");
                                acts.className = "layer-actions";

                                const visBtn = document.createElement("button");
                                visBtn.type = "button";
                                visBtn.className = "layer-ico-btn" + (!lyr.visible ? " off" : "");
                                visBtn.textContent = lyr.visible ? "👁" : "🙈";
                                visBtn.title = lyr.visible ? "Hide layer" : "Show layer";
                                visBtn.onclick = (e) => toggleLayerVisibility(lyr.id, e);

                                const upBtn = document.createElement("button");
                                upBtn.type = "button";
                                upBtn.className = "layer-ico-btn";
                                upBtn.textContent = "↑";
                                upBtn.title = "Move layer up";
                                upBtn.disabled = (i === layers.length - 1);
                                upBtn.onclick = (e) => moveLayerOrder(lyr.id, 1, e);

                                const dnBtn = document.createElement("button");
                                dnBtn.type = "button";
                                dnBtn.className = "layer-ico-btn";
                                dnBtn.textContent = "↓";
                                dnBtn.title = "Move layer down";
                                dnBtn.disabled = (i === 0);
                                dnBtn.onclick = (e) => moveLayerOrder(lyr.id, -1, e);

                                const delBtn = document.createElement("button");
                                delBtn.type = "button";
                                delBtn.className = "layer-ico-btn del";
                                delBtn.textContent = "×";
                                delBtn.title = "Delete layer";
                                delBtn.onclick = (e) => deleteLayerById(lyr.id, e);

                                acts.append(visBtn, upBtn, dnBtn, delBtn);
                                row.append(thumb, meta, acts);
                                list.appendChild(row);
                            }
                        }"""
    text = replace_exact(text, old_committed, new_committed, "JS Ibis Paint Layer Rendering & Management")

    # 7. JS: Clear, Preview, Save PNG, Share, and Post flatten visible layers in order
    old_clear = """                            strokes = [];
                            redoStack = [];
                            clearTexts();
                            resetStudioZoom();
                            redrawStudio();
                            updateHistoryUI();
                            lsSet(LS_DRAFT, null);"""
    new_clear = """                            clearTexts();
                            layers = [{ id: "layer_base", name: "Layer 1", type: "draw", visible: true, strokes: [], redoStack: [] }];
                            activeLayerId = "layer_base";
                            layerCounter = 1;
                            resetStudioZoom();
                            redrawStudio();
                            updateHistoryUI();
                            renderLayersPanel();
                            lsSet(LS_DRAFT, null);"""
    text = replace_exact(text, old_clear, new_clear, "JS clearCanvas reset layers")

    old_preview = """                        function previewDrawing() {
                            const all = strokes.concat(getTextItems());"""
    new_preview = """                        function previewDrawing() {
                            const all = getAllFlattenedStrokes(false);"""
    text = replace_exact(text, old_preview, new_preview, "JS previewDrawing flatten visible layers")

    old_save_png = """                        function saveStudioPNG() {
                            const all = strokes.concat(getTextItems());"""
    new_save_png = """                        function saveStudioPNG() {
                            const all = getAllFlattenedStrokes(false);"""
    text = replace_exact(text, old_save_png, new_save_png, "JS saveStudioPNG flatten visible layers")

    old_submit_probe = """                        function submitToWall() {
                            deselectText();
                            const probe = strokes.concat(getTextItems());"""
    new_submit_probe = """                        function submitToWall() {
                            deselectText();
                            const probe = getAllFlattenedStrokes(false);"""
    text = replace_exact(text, old_submit_probe, new_submit_probe, "JS submitToWall probe visible layers")

    old_submit_core = """                        async function submitToWallCore() {
                            deselectText();
                            const items = strokes.concat(getTextItems());"""
    new_submit_core = """                        async function submitToWallCore() {
                            deselectText();
                            const items = getAllFlattenedStrokes(false);"""
    text = replace_exact(text, old_submit_core, new_submit_core, "JS submitToWallCore flatten visible layers")

    old_get_all = """                        function getAllItems() {
                            const all = strokes.concat(getTextItems());"""
    new_get_all = """                        function getAllItems() {
                            const all = getAllFlattenedStrokes(false);"""
    text = replace_exact(text, old_get_all, new_get_all, "JS getAllItems flatten visible layers")

    target.write_text(text, encoding="utf-8")
    print(f"Successfully added Ibis Paint-style layers to {target} (backup saved to {backup}).")


if __name__ == "__main__":
    main()