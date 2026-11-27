#!/usr/bin/env python3
"""
patch_artcher.py  --  revise the ARTcher single-file HTML.

usage:  python patch_artcher.py index.html [output.html]

Every change is anchored to existing code. If ANY anchor is missing or matches
an unexpected number of times, nothing is written and the failures are listed.
"""
import re, sys, pathlib, subprocess, tempfile, shutil

# =====================================================================================
# CSS
# =====================================================================================
V3_CSS = r'''
<style id="artcher-v3">
/* ---- sheet tabs: 6 tabs now ---- */
.sheet-tabs { grid-template-columns: repeat(6, 1fr); }
.sheet-tab { font-size: 11.5px; gap: 4px; padding: 0 2px; }
@media (max-width: 400px) { .sheet-tab svg { display: none; } }
.tool-dock { grid-template-columns: repeat(6, 1fr); }

/* ---- shapes pane ---- */
.shape-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; }
.shape-btn { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px;
  height: 54px; padding: 0; border: 1px solid var(--border); border-radius: 10px; background: #fff;
  color: var(--muted); font-size: 9.5px; font-weight: 700; cursor: pointer; transition: transform .1s, background .12s; }
.shape-btn svg { width: 22px; height: 22px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
.shape-btn svg polyline { vector-effect: non-scaling-stroke; }
.shape-btn:active { transform: scale(.95); }
.shape-btn.active { background: var(--ink); color: #fff; border-color: var(--ink); }
.shape-grid.filled .shape-btn svg { fill: currentColor; fill-opacity: .22; }

/* ---- draw indicator on canvas ---- */
.draw-hud { position: absolute; left: 8px; top: 8px; z-index: 8; display: flex; align-items: center; gap: 6px;
  max-width: calc(100% - 16px); padding: 4px 9px; border-radius: 999px; white-space: nowrap; overflow: hidden;
  background: rgba(255,255,255,.93); border: 1px solid var(--border); box-shadow: 0 2px 8px rgba(15,23,42,.1);
  font: 700 10.5px 'JetBrains Mono', monospace; color: var(--muted); pointer-events: none; transition: border-color .15s, color .15s; }
.dh-dot { width: 8px; height: 8px; border-radius: 50%; background: #94a3b8; flex-shrink: 0; }
#dh-layer { max-width: 84px; overflow: hidden; text-overflow: ellipsis; }
.dh-sep { opacity: .5; }
.draw-hud.live { color: var(--ink); border-color: #fecaca; }
.draw-hud.live .dh-dot { background: #ef4444; animation: dhPulse .8s ease-in-out infinite; }
.draw-hud.warn #dh-size { color: #d97706; }
@keyframes dhPulse { 0%,100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.5); opacity: .55; } }
.canvas-frame.is-drawing { border-color: var(--accent); }
.studio-stats.warn { color: #d97706; }
@media (prefers-reduced-motion: reduce) { .draw-hud.live .dh-dot { animation: none; } }

/* ---- layers: long-press reorder ---- */
.layer-list { max-height: 260px; padding: 2px 2px 4px; }
.layer-row { user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; }
.layer-row.dragging { position: relative; z-index: 6; background: #fff; border-color: var(--accent);
  box-shadow: 0 10px 22px rgba(15,23,42,.22); transition: none; cursor: grabbing; }
.layer-row.drop-before { box-shadow: 0 -3px 0 0 var(--accent); }
.layer-row.drop-after  { box-shadow: 0 3px 0 0 var(--accent); }
.layer-hint { font-size: 10.5px; font-weight: 600; color: var(--muted); text-align: center; }
.list-row small { line-height: 1.3; }

/* ---- wall reactions: stage must sit ABOVE the wall canvas, and pills keep a readable size ---- */
#wall-canvas { z-index: 1; }
#wall-stage { z-index: 2; }
.wall-tile-react { font-size: 12px; padding: 3px 8px; transform: scale(var(--pill-s, 1)); transform-origin: bottom right; }
.wall-tile-tag { font-size: 12px; transform: translateX(-50%) scale(var(--pill-s, 1)); transform-origin: bottom center; }
#wall-stage.far .wall-tile-react { display: none !important; }
</style>
'''

# =====================================================================================
# HTML fragments
# =====================================================================================
SHAPE_DOCK_BTN = r'''<button type="button" class="tool-btn" data-tool="shape" onclick="setTool('shape'); setDrawTab('shapes'); syncShapePane();" title="Shapes (S)">
                                        <svg viewBox="0 0 24 24"><path d="M3 20 L9 8 L15 20 Z"></path><circle cx="16.5" cy="8.5" r="4.5"></circle></svg><span>Shapes</span>
                                    </button>
                                    '''

DRAW_HUD = r'''<div class="draw-hud" id="draw-hud" aria-hidden="true"><span class="dh-dot"></span><span id="dh-tool">Brush</span><span class="dh-sep">·</span><span id="dh-layer">Layer 1</span><span class="dh-sep">·</span><span id="dh-size">0.000 MB</span></div>
                                        '''

SHAPES_TAB = r'''<button class="sheet-tab" data-pane="shapes" role="tab" onclick="setDrawTab('shapes'); syncShapePane();">
                                            <svg viewBox="0 0 24 24"><polygon points="12 3 22 20 2 20"/></svg>Shapes
                                        </button>
                                        '''

SHAPES_PANE = r'''<!-- SHAPES PANE -->
                                <div class="sheet-pane" id="pane-shapes">
                                    <div class="shape-grid" id="shape-grid"></div>
                                    <div class="slider-row">
                                        <span>Stroke</span>
                                        <input type="range" id="shape-size-slider" min="1" max="40" step="1" value="5" oninput="setShapeStroke(this.value)" />
                                        <span class="slider-val" id="shape-size-val">5px</span>
                                    </div>
                                    <div class="row-between">
                                        <button type="button" class="fill-toggle-btn shape-fill-toggle" onclick="toggleShapeFill()">
                                            <svg viewBox="0 0 24 24" style="width:14px;height:14px;stroke:currentColor;fill:currentColor;"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>
                                            <span>Fill shape</span>
                                        </button>
                                        <button type="button" class="fill-toggle-btn" id="shape-lock-btn" onclick="toggleShapeLock()">Perfect shapes</button>
                                    </div>
                                    <div class="ref-badge-note">Drag on the canvas to draw. Color &amp; opacity come from the Style tab. Shift also gives perfect shapes.</div>
                                </div>

                                '''

LAYER_HINT = r'''<div class="layer-list" id="layer-list"></div>
                                    <div class="layer-hint">Long-press a layer, then drag to reorder</div>'''

SIZE_STATS = r'''
                                    <div class="studio-stats" id="studio-size-stats">Estimated post size: ~0.000 MB</div>'''

REF_PICK_BTN = r'''<button type="button" class="btn btn-sm btn-block" id="ref-pick-btn" onclick="toggleRefPickMode()">Picker: Auto</button>
                                        <div class="ref-badge-note">Picker tool samples the reference's original colors (ignores opacity &amp; B&amp;W).</div>
                                        <div class="ref-actions-row">'''

OPTION_ROWS = r'''
                                <label class="list-row">
                                    <span>Wall minimap<small>Navigator map on the wall</small></span>
                                    <span class="switch"><input type="checkbox" id="opt-minimap" checked onchange="applyOptions()"></span>
                                </label>
                                <label class="list-row">
                                    <span>Weather system<small>Live sky, rain &amp; storm effects</small></span>
                                    <span class="switch"><input type="checkbox" id="opt-weather" checked onchange="applyOptions()"></span>
                                </label>
                                <label class="list-row">
                                    <span>Haptic feedback<small>Vibration on taps, strokes &amp; actions</small></span>
                                    <span class="switch"><input type="checkbox" id="opt-haptic" checked onchange="applyOptions()"></span>
                                </label>'''

# =====================================================================================
# JS replacements
# =====================================================================================
HAPTIC_JS = r'''var hapticOn = true, lastHapticAt = 0, iosHapticLabel = null, v3Ready = false;
                        function haptic(ms = 8) {
                            if (!hapticOn) return;
                            const now = performance.now();
                            if (now - lastHapticAt < 35) return;      // de-dupe stacked calls
                            lastHapticAt = now;
                            try {
                                if (navigator.vibrate) { navigator.vibrate(ms); return; }
                            } catch (e) {}
                            // iOS 17.4+ Safari: toggling a hidden <input switch> fires a native tick
                            try {
                                if (!iosHapticLabel) {
                                    const input = document.createElement("input");
                                    input.type = "checkbox";
                                    input.setAttribute("switch", "");
                                    input.id = "ios-haptic-switch";
                                    input.tabIndex = -1;
                                    const label = document.createElement("label");
                                    label.htmlFor = "ios-haptic-switch";
                                    label.setAttribute("aria-hidden", "true");
                                    label.style.cssText = "position:fixed;left:-100px;top:-100px;width:1px;height:1px;opacity:0;pointer-events:none;overflow:hidden;";
                                    label.appendChild(input);
                                    document.body.appendChild(label);
                                    iosHapticLabel = label;
                                }
                                iosHapticLabel.click();
                            } catch (e) {}
                        }
'''

SETTOOL_JS = r'''var SHAPE_DEFS = [
                            ["line", "Line"], ["rect", "Box"], ["rounded", "Rounded"], ["circle", "Circle"], ["triangle", "Triangle"],
                            ["rtriangle", "Right tri"], ["diamond", "Diamond"], ["pentagon", "Pentagon"], ["hexagon", "Hexagon"], ["octagon", "Octagon"],
                            ["star", "Star"], ["heart", "Heart"], ["arrow", "Arrow"], ["plus", "Plus"], ["slant", "Slant"]
                        ];
                        var SHAPE_KEYS = SHAPE_DEFS.map(s => s[0]);
                        var lastShape = "rect";
                        function isShapeTool(t) { return SHAPE_KEYS.indexOf(t) !== -1; }

                        function setTool(tool) {
                            if (tool === "shape") tool = lastShape;
                            if (isShapeTool(tool)) lastShape = tool;
                            currentTool = tool;
                            const dockKey = isShapeTool(tool) ? "shape" : tool;
                            document.querySelectorAll(".tool-btn").forEach(btn => {
                                btn.classList.toggle("active", btn.dataset.tool === dockKey);
                            });
                            document.querySelectorAll(".shape-btn").forEach(btn => {
                                btn.classList.toggle("active", btn.dataset.shape === tool);
                            });
                            canvasFrame.classList.remove("mode-hand", "mode-eraser", "mode-fill", "mode-eyedropper");
                            if (tool === "hand") canvasFrame.classList.add("mode-hand");
                            if (tool === "eraser") canvasFrame.classList.add("mode-eraser");
                            if (tool === "fill") canvasFrame.classList.add("mode-fill");
                            if (tool === "eyedropper") canvasFrame.classList.add("mode-eyedropper");
                            if (tool !== "hand") deselectText();
                            if (isShapeTool(tool)) syncShapePane();
                            if (v3Ready) updateDrawHud();
                            haptic(6);
                        }

                        '''

SHAPES_JS = r'''function buildShapePoints(shapeType, p0, p1, constrain = false) {
                            let [x0, y0] = p0;
                            let [x1, y1] = p1;

                            if (shapeType === "line") {
                                if (constrain) {
                                    const dx = x1 - x0;
                                    const dy = y1 - y0;
                                    const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
                                    const dist = Math.hypot(dx, dy);
                                    x1 = Math.round(x0 + Math.cos(angle) * dist);
                                    y1 = Math.round(y0 + Math.sin(angle) * dist);
                                }
                                return [[x0, y0], [x1, y1]];
                            }

                            if (constrain) {
                                const side = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
                                x1 = x0 + Math.sign(x1 - x0 || 1) * side;
                                y1 = y0 + Math.sign(y1 - y0 || 1) * side;
                            }

                            const L = Math.min(x0, x1), R = Math.max(x0, x1);
                            const T = Math.min(y0, y1), B = Math.max(y0, y1);
                            const w = R - L, h = B - T;
                            const cx = (L + R) / 2, cy = (T + B) / 2;
                            const rx = w / 2, ry = h / 2;
                            const done = (pts) => pts.map(([x, y]) => [Math.round(x), Math.round(y)]);
                            const ngon = (n, rot) => {
                                const pts = [];
                                for (let i = 0; i < n; i++) {
                                    const a = rot + (i / n) * Math.PI * 2;
                                    pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
                                }
                                pts.push(pts[0]);
                                return pts;
                            };

                            switch (shapeType) {
                                case "rect":
                                    return done([[L, T], [R, T], [R, B], [L, B], [L, T]]);
                                case "rounded": {
                                    const r = Math.min(w, h) * 0.22;
                                    const pts = [];
                                    const corner = (ccx, ccy, a0) => {
                                        for (let i = 0; i <= 6; i++) {
                                            const a = a0 + (i / 6) * (Math.PI / 2);
                                            pts.push([ccx + Math.cos(a) * r, ccy + Math.sin(a) * r]);
                                        }
                                    };
                                    corner(R - r, T + r, -Math.PI / 2);
                                    corner(R - r, B - r, 0);
                                    corner(L + r, B - r, Math.PI / 2);
                                    corner(L + r, T + r, Math.PI);
                                    pts.push(pts[0]);
                                    return done(pts);
                                }
                                case "circle":
                                    return done(ngon(48, 0));
                                case "triangle":
                                    return done([[cx, T], [R, B], [L, B], [cx, T]]);
                                case "rtriangle":
                                    return done([[L, T], [L, B], [R, B], [L, T]]);
                                case "diamond":
                                    return done([[cx, T], [R, cy], [cx, B], [L, cy], [cx, T]]);
                                case "pentagon":
                                    return done(ngon(5, -Math.PI / 2));
                                case "hexagon":
                                    return done(ngon(6, 0));
                                case "octagon":
                                    return done(ngon(8, -Math.PI / 2 + Math.PI / 8));
                                case "star": {
                                    const pts = [];
                                    for (let i = 0; i < 10; i++) {
                                        const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
                                        const k = i % 2 ? 0.42 : 1;
                                        pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
                                    }
                                    pts.push(pts[0]);
                                    return done(pts);
                                }
                                case "heart": {
                                    const pts = [];
                                    for (let i = 0; i <= 64; i++) {
                                        const t = (i / 64) * Math.PI * 2;
                                        const hx = 16 * Math.pow(Math.sin(t), 3);
                                        const hy = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
                                        pts.push([cx + (hx / 16) * rx, T + ((12 - hy) / 29) * h]);
                                    }
                                    return done(pts);
                                }
                                case "arrow": {
                                    const s = h * 0.18, neck = L + w * 0.58;
                                    return done([[L, cy - s], [neck, cy - s], [neck, T], [R, cy], [neck, B], [neck, cy + s], [L, cy + s], [L, cy - s]]);
                                }
                                case "plus": {
                                    const a = w / 3, b = h / 3;
                                    return done([[L + a, T], [R - a, T], [R - a, T + b], [R, T + b], [R, B - b], [R - a, B - b],
                                                 [R - a, B], [L + a, B], [L + a, B - b], [L, B - b], [L, T + b], [L + a, T + b], [L + a, T]]);
                                }
                                case "slant": {
                                    const s = w * 0.25;
                                    return done([[L + s, T], [R, T], [R - s, B], [L, B], [L + s, T]]);
                                }
                            }
                            return done([[L, T], [R, T], [R, B], [L, B], [L, T]]);
                        }

                        '''

PICK_JS = r'''var refPickMode = "auto";
                        function toggleRefPickMode() {
                            refPickMode = refPickMode === "auto" ? "ref" : "auto";
                            const b = document.getElementById("ref-pick-btn");
                            if (b) b.textContent = refPickMode === "ref" ? "Picker: Reference first" : "Picker: Auto";
                            haptic(6);
                            showToast(refPickMode === "ref" ? "Picker reads the reference image first" : "Picker reads your drawing, then the reference");
                        }

                        var _refSampler = null;
                        // returns the ORIGINAL pixel color of the trace image under canvas point (x, y), or null
                        function sampleRefColor(x, y) {
                            try {
                                const img = document.getElementById("ref-img");
                                if (!img || !refState.loaded || !refState.visible || !img.complete || !img.naturalWidth) return null;
                                const W = canvasStage.offsetWidth || 460;
                                const dw = img.offsetWidth, dh = img.offsetHeight;
                                if (!dw || !dh) return null;
                                // canvas point -> stage px, relative to stage centre, undo translate / scale / rotate
                                const px = (x / 500) * W - W / 2 - refState.x;
                                const py = (y / 500) * W - W / 2 - refState.y;
                                const s = refState.scale || 1;
                                const a = -(refState.rot || 0) * Math.PI / 180;
                                const vx = px / s, vy = py / s;
                                const rx = vx * Math.cos(a) - vy * Math.sin(a);
                                const ry = vx * Math.sin(a) + vy * Math.cos(a);
                                const lx = rx + dw / 2, ly = ry + dh / 2;
                                const nw = img.naturalWidth, nh = img.naturalHeight;
                                const k = Math.min(dw / nw, dh / nh);                  // object-fit: contain
                                const ox = (dw - nw * k) / 2, oy = (dh - nh * k) / 2;
                                const ix = (lx - ox) / k, iy = (ly - oy) / k;
                                if (ix < 0 || iy < 0 || ix >= nw || iy >= nh) return null;
                                if (!_refSampler) {
                                    _refSampler = document.createElement("canvas");
                                    _refSampler.width = _refSampler.height = 1;
                                    _refSampler.ctx = _refSampler.getContext("2d", { willReadFrequently: true });
                                }
                                const c = _refSampler.ctx;
                                const sw = Math.min(3, nw), sh = Math.min(3, nh);       // tiny 3x3 average = steadier on JPEGs
                                const sx = Math.max(0, Math.min(nw - sw, Math.floor(ix) - 1));
                                const sy = Math.max(0, Math.min(nh - sh, Math.floor(iy) - 1));
                                c.clearRect(0, 0, 1, 1);
                                c.drawImage(img, sx, sy, sw, sh, 0, 0, 1, 1);
                                const d = c.getImageData(0, 0, 1, 1).data;
                                if (d[3] < 40) return null;
                                return rgbToHex(d[0], d[1], d[2]);
                            } catch (e) { return null; }
                        }

                        function sampleDrawColor(x, y) {
                            const px = drawCtx.getImageData(clamp(x, 0, 499), clamp(y, 0, 499), 1, 1).data;
                            return px[3] < 20 ? null : rgbToHex(px[0], px[1], px[2]);
                        }

                        function samplePickColor(x, y) {
                            const ref = sampleRefColor(x, y);
                            const dr = sampleDrawColor(x, y);
                            if (refPickMode === "ref") {
                                if (ref) return { hex: ref, from: "ref" };
                                if (dr) return { hex: dr, from: "draw" };
                            } else {
                                if (dr) return { hex: dr, from: "draw" };
                                if (ref) return { hex: ref, from: "ref" };
                            }
                            return null;
                        }

                        function pickColorAt(pt) {
                            const [x, y] = pt;
                            const sp = samplePickColor(x, y);
                            const hex = sp ? sp.hex : paperBg;
                            rememberUsedColor(hex);
                            selectColor(hex, true);
                            haptic(10);
                            showToast((sp && sp.from === "ref" ? "Picked from reference " : "Picked color ") + hex.toUpperCase());
                        }

                        '''

OPTIONS_JS = r'''var weatherApplied = false;
                        function applyOptions() {
                            const showGrid = document.getElementById("opt-grid").checked;
                            smoothStrokes = document.getElementById("opt-smooth").checked;
                            const showBorders = document.getElementById("opt-borders").checked;
                            const showMinimap = document.getElementById("opt-minimap").checked;
                            const wxOn = document.getElementById("opt-weather").checked;
                            const hapOn = document.getElementById("opt-haptic").checked;

                            canvasFrame.classList.toggle("show-grid", showGrid);
                            document.getElementById("wall-stage").classList.toggle("wall-stage-bordered", showBorders);

                            hapticOn = hapOn;
                            minimapOn = showMinimap;
                            applyMinimapToggle();

                            const wxChanged = !weatherApplied || weatherOn !== wxOn;
                            weatherOn = wxOn;
                            weatherApplied = true;
                            applyWeatherToggle(wxChanged);

                            if (typeof scheduleWallPaint === "function") scheduleWallPaint();

                            lsSet(LS_OPTIONS, {
                                grid: showGrid,
                                smooth: smoothStrokes,
                                borders: showBorders,
                                minimap: showMinimap,
                                weather: wxOn,
                                haptic: hapOn
                            });

                            redrawStudio();
                        }

                        function loadOptions() {
                            const saved = lsGet(LS_OPTIONS, { grid: false, smooth: true, borders: false, minimap: true, weather: true, haptic: true });
                            document.getElementById("opt-grid").checked = Boolean(saved.grid);
                            document.getElementById("opt-smooth").checked = saved.smooth !== false;
                            document.getElementById("opt-borders").checked = Boolean(saved.borders);
                            document.getElementById("opt-minimap").checked = saved.minimap !== false;
                            document.getElementById("opt-weather").checked = saved.weather !== false;
                            document.getElementById("opt-haptic").checked = saved.haptic !== false;
                            applyOptions();
                        }

                        '''

BOTTOM_WEATHER_JS = r'''weatherReady = true;
                        startWeatherEngine();
                        initWeatherSync();'''

# New runtime code, inserted just before the APK section (after every const it relies on exists).
V3_JS = r'''// =========================================================================
                        // V3 ADDITIONS: settings toggles, shapes, layer reorder, size + draw indicator, haptics
                        // =========================================================================
                        var weatherOn = true, minimapOn = true, weatherReady = false, weatherSyncStarted = false, weatherCoords = null;
                        var shapeLock = false;
                        var POST_WARN_MB = 0.19;   // ~200,000 chars: above this the live broadcast falls back to a light notice. Change to your backend's real limit.
                        var sizeTimer = 0, lastSizeMB = 0, _hudLive = false, _lastSizeTick = 0;
                        var layerDrag = null, layerDragJustEnded = false;

                        // ---------- settings: minimap ----------
                        function applyMinimapToggle() {
                            const el = document.getElementById("minimap");
                            if (!el) return;
                            el.hidden = !minimapOn;
                            if (minimapOn) updateMinimap();
                        }

                        // ---------- settings: weather ----------
                        function initWeatherSync() {
                            if (!weatherOn) return;
                            if (weatherSyncStarted) {
                                if (weatherCoords) syncLiveWeather(weatherCoords[0], weatherCoords[1]);
                                else syncLiveWeather();
                                return;
                            }
                            weatherSyncStarted = true;
                            if (navigator.geolocation) {
                                navigator.geolocation.getCurrentPosition(
                                    pos => { weatherCoords = [pos.coords.latitude, pos.coords.longitude]; syncLiveWeather(weatherCoords[0], weatherCoords[1]); },
                                    () => syncLiveWeather()
                                );
                            } else {
                                syncLiveWeather();
                            }
                        }

                        function applyWeatherToggle(changed) {
                            const pill = document.getElementById("weather-pill");
                            const cvs = document.getElementById("weather-canvas");
                            if (pill) pill.hidden = !weatherOn;
                            if (cvs) cvs.style.display = weatherOn ? "" : "none";
                            if (!changed) return;
                            if (!weatherOn) weatherOverride = "auto";
                            rebuildWeatherParticles();
                            updateWeatherPillUI();
                            if (typeof startSeasonalParticles === "function") startSeasonalParticles();
                            if (weatherReady && weatherOn) {
                                if (!weatherRaf) startWeatherEngine();
                                initWeatherSync();
                            }
                        }

                        // ---------- shapes pane ----------
                        function initShapePane() {
                            const grid = document.getElementById("shape-grid");
                            if (!grid) return;
                            grid.replaceChildren();
                            SHAPE_DEFS.forEach(([key, label]) => {
                                const b = document.createElement("button");
                                b.type = "button";
                                b.className = "shape-btn" + (currentTool === key ? " active" : "");
                                b.dataset.shape = key;
                                b.title = label;
                                b.setAttribute("aria-label", label);
                                const pts = buildShapePoints(key, [30, 30], [210, 210], false).map(p => p[0] + "," + p[1]).join(" ");
                                b.innerHTML = `<svg viewBox="0 0 240 240"><polyline points="${pts}"/></svg><span>${label}</span>`;
                                b.onclick = () => setTool(key);
                                grid.appendChild(b);
                            });
                            syncShapePane();
                        }
                        function syncShapePane() {
                            const s = document.getElementById("shape-size-slider");
                            const v = document.getElementById("shape-size-val");
                            if (s) s.value = currentSize;
                            if (v) v.textContent = currentSize + "px";
                        }
                        function setShapeStroke(val) {
                            currentSize = clamp(Number(val) || 1, 1, 40);
                            document.querySelectorAll(".size-btn").forEach(b => b.classList.remove("active"));
                            const v = document.getElementById("shape-size-val");
                            if (v) v.textContent = currentSize + "px";
                        }
                        function toggleShapeLock() {
                            shapeLock = !shapeLock;
                            const b = document.getElementById("shape-lock-btn");
                            if (b) b.classList.toggle("active", shapeLock);
                            haptic(6);
                            showToast(shapeLock ? "Perfect shapes: on" : "Perfect shapes: off");
                        }

                        // ---------- post size estimate + draw indicator ----------
                        function estimatePayloadMB() {
                            const items = getAllFlattenedStrokes(false);
                            if (!items.length) return 0;
                            if (paperBg !== "#ffffff") items.unshift({ k: "bg", c: paperBg });
                            return (new Blob([JSON.stringify(items)]).size + 260) / 1048576;   // +260 B for id/author/grid fields
                        }
                        function fmtMB(mb) { return mb.toFixed(3) + " MB"; }
                        function scheduleSizeUpdate(delay) {
                            clearTimeout(sizeTimer);
                            sizeTimer = setTimeout(refreshSizeUI, delay == null ? 120 : delay);
                        }
                        function refreshSizeUI() {
                            sizeTimer = 0;
                            lastSizeMB = estimatePayloadMB();
                            const txt = fmtMB(lastSizeMB);
                            const warn = lastSizeMB >= POST_WARN_MB;
                            const hs = document.getElementById("dh-size");
                            if (hs) hs.textContent = txt;
                            const hud = document.getElementById("draw-hud");
                            if (hud) hud.classList.toggle("warn", warn);
                            const st = document.getElementById("studio-size-stats");
                            if (st) {
                                st.textContent = "Estimated post size: ~" + txt + (warn ? " · large drawing, may upload slowly" : "");
                                st.classList.toggle("warn", warn);
                            }
                        }
                        function toolLabel() {
                            if (isShapeTool(currentTool)) {
                                const d = SHAPE_DEFS.find(s => s[0] === currentTool);
                                return d ? d[1] : "Shape";
                            }
                            return ({ brush: "Brush", eraser: "Eraser", hand: "Hand", fill: "Fill", eyedropper: "Picker" })[currentTool] || currentTool;
                        }
                        function updateDrawHud() {
                            const t = document.getElementById("dh-tool");
                            if (!t) return;
                            t.textContent = _hudLive ? "Drawing…" : toolLabel();
                            const lyr = layers.find(l => l.id === activeLayerId);
                            const ln = document.getElementById("dh-layer");
                            if (ln) ln.textContent = lyr ? lyr.name : "Layer";
                        }
                        function onHistoryChanged() {
                            if (!v3Ready) return;
                            scheduleSizeUpdate();
                            updateDrawHud();
                        }
                        function initDrawHud() {
                            const hud = document.getElementById("draw-hud");
                            setInterval(() => {
                                if (currentView !== "draw") return;
                                const live = !!(isDrawing && (currentStroke || shapeStart));
                                if (live !== _hudLive) {
                                    _hudLive = live;
                                    if (hud) hud.classList.toggle("live", live);
                                    canvasFrame.classList.toggle("is-drawing", live);
                                    updateDrawHud();
                                    if (!live) scheduleSizeUpdate(40);
                                } else if (live) {
                                    const now = performance.now();
                                    if (now - _lastSizeTick > 350) { _lastSizeTick = now; refreshSizeUI(); }
                                }
                            }, 100);
                        }

                        // ---------- layers: long-press to reorder ----------
                        function initLayerDrag() {
                            const list = document.getElementById("layer-list");
                            if (!list) return;
                            const LONG_MS = 380, TOL = 9;
                            let pend = null;

                            const clearMarks = () => list.querySelectorAll(".drop-before,.drop-after").forEach(r => r.classList.remove("drop-before", "drop-after"));
                            const others = () => [...list.children].filter(r => !layerDrag || r !== layerDrag.row);

                            function startDrag() {
                                if (!pend) return;
                                const { row, id, y } = pend;
                                pend = null;
                                layerDrag = { row, id, startY: y, curY: y, startScroll: list.scrollTop, idx: 0, timer: 0 };
                                row.classList.add("dragging");
                                layerDrag.timer = setInterval(updateDrag, 60);
                                haptic(18);
                            }

                            function updateDrag() {
                                const d = layerDrag;
                                if (!d) return;
                                const lr = list.getBoundingClientRect();
                                if (d.curY < lr.top + 22) list.scrollTop -= 7;
                                else if (d.curY > lr.bottom - 22) list.scrollTop += 7;
                                const dy = d.curY - d.startY + (list.scrollTop - d.startScroll);
                                d.row.style.transform = `translateY(${dy}px) scale(1.02)`;
                                const rows = others();
                                d.idx = rows.filter(r => { const b = r.getBoundingClientRect(); return b.top + b.height / 2 < d.curY; }).length;
                                clearMarks();
                                if (!rows.length) return;
                                if (d.idx < rows.length) rows[d.idx].classList.add("drop-before");
                                else rows[rows.length - 1].classList.add("drop-after");
                            }

                            function commit(d) {
                                const ids = [...list.children].map(r => r.dataset.id);
                                const from = ids.indexOf(d.id);
                                if (from < 0) return renderLayersPanel();
                                ids.splice(from, 1);
                                ids.splice(d.idx, 0, d.id);
                                const next = ids.slice().reverse().map(id => layers.find(l => l.id === id)).filter(Boolean);   // list is shown top-first
                                const changed = next.length === layers.length && next.some((l, i) => l !== layers[i]);
                                if (changed) {
                                    layers = next;
                                    syncTextLayerZOrder();
                                    redrawStudio();
                                    scheduleDraftSave();
                                    haptic(12);
                                    showToast("Layer moved");
                                }
                                renderLayersPanel();
                            }

                            function finish(cancelled) {
                                if (pend) { clearTimeout(pend.timer); pend = null; }
                                if (!layerDrag) return;
                                const d = layerDrag;
                                layerDrag = null;
                                clearInterval(d.timer);
                                clearMarks();
                                d.row.classList.remove("dragging");
                                d.row.style.transform = "";
                                layerDragJustEnded = true;
                                setTimeout(() => { layerDragJustEnded = false; }, 80);
                                if (cancelled) renderLayersPanel(); else commit(d);
                            }

                            list.addEventListener("pointerdown", (e) => {
                                if (e.button !== undefined && e.button !== 0) return;
                                const row = e.target.closest(".layer-row");
                                if (!row || e.target.closest("button")) return;
                                pend = { row, id: row.dataset.id, x: e.clientX, y: e.clientY, timer: setTimeout(startDrag, LONG_MS) };
                            });
                            window.addEventListener("pointermove", (e) => {
                                if (pend) {
                                    if (Math.hypot(e.clientX - pend.x, e.clientY - pend.y) > TOL) { clearTimeout(pend.timer); pend = null; }
                                    return;
                                }
                                if (layerDrag) layerDrag.curY = e.clientY;
                            });
                            window.addEventListener("pointerup", () => finish(false));
                            window.addEventListener("pointercancel", () => finish(true));
                            list.addEventListener("touchmove", (e) => { if (layerDrag) e.preventDefault(); }, { passive: false });
                            list.addEventListener("contextmenu", (e) => e.preventDefault());
                            list.addEventListener("click", (e) => {
                                if (layerDragJustEnded) { e.stopPropagation(); e.preventDefault(); }
                            }, true);
                        }

                        // ---------- haptics: every button / switch / select ----------
                        document.addEventListener("click", (e) => {
                            if (e.target.closest && e.target.closest("button, .nav-item, .list-row, .swatch, .saved-swatch, .paper-chip, [role='button']")) haptic(5);
                        });
                        document.addEventListener("change", (e) => {
                            if (e.target.matches && e.target.matches(".switch input, select, input[type=range]")) haptic(6);
                        });

                        v3Ready = true;
                        scheduleSizeUpdate(200);

                        '''

# =====================================================================================
# patch engine
# =====================================================================================
html = ""
errors = []

def lit(old, new, count=1, label=None):
    global html
    n = html.count(old)
    if n != count:
        errors.append(f"[literal x{count}] found {n}: {label or old[:70]!r}")
        return
    html = html.replace(old, new)

def rx(pattern, new, count=1, flags=re.S, label=None):
    global html
    found = len(re.findall(pattern, html, flags))
    if found != count:
        errors.append(f"[regex x{count}] found {found}: {label or pattern[:70]!r}")
        return
    html = re.sub(pattern, (lambda m: new(m) if callable(new) else new), html, flags=flags)

def apply_patches():
    # ---------------- CSS ----------------
    lit("</head>", V3_CSS + "</head>", label="</head>")

    # ---------------- HTML ----------------
    rx(r'<button type="button" class="tool-btn" data-tool="line".*?</button>\s*', SHAPE_DOCK_BTN, label="dock: line btn")
    rx(r'<button type="button" class="tool-btn" data-tool="rect".*?</button>\s*', '', label="dock: rect btn")
    rx(r'<button type="button" class="tool-btn" data-tool="circle".*?</button>\s*', '', label="dock: circle btn")
    lit('<div class="canvas-stage" id="canvas-stage">', DRAW_HUD + '<div class="canvas-stage" id="canvas-stage">', label="canvas-stage")
    lit('<button class="sheet-tab" data-pane="post"', SHAPES_TAB + '<button class="sheet-tab" data-pane="post"', label="post tab")
    lit('<!-- POST PANE -->', SHAPES_PANE + '<!-- POST PANE -->', label="POST PANE comment")
    lit('<div class="layer-list" id="layer-list"></div>', LAYER_HINT, label="layer-list")
    rx(r'(<div class="studio-stats" id="studio-stats">.*?</div>)', lambda m: m.group(1) + SIZE_STATS, label="studio-stats")
    lit('<div class="ref-actions-row">', REF_PICK_BTN, label="ref-actions-row")
    rx(r'(id="opt-borders"[^>]*></span>\s*</label>)', lambda m: m.group(1) + OPTION_ROWS, label="opt-borders row")

    # ---------------- haptics ----------------
    rx(r'function haptic\(ms = 8\) \{.*?\n[ \t]*\}\n', HAPTIC_JS, label="haptic()")
    lit('redoStack.push(strokes.pop());', 'redoStack.push(strokes.pop()); haptic(6);', label="undo")
    lit('strokes.push(redoStack.pop());', 'strokes.push(redoStack.pop()); haptic(6);', label="redo")
    lit('strokes.push(currentStroke);', 'strokes.push(currentStroke); haptic(4);', label="stroke start")
    rx(r'\n[ \t]*committedCount = -1;', lambda m: m.group(0) + ' haptic(5);', label="stroke end")
    lit('strokes.push({ k: "fill", c: currentColor, a: currentOpacity, x: pt[0], y: pt[1] });',
        'strokes.push({ k: "fill", c: currentColor, a: currentOpacity, x: pt[0], y: pt[1] }); haptic(12);', label="fill")
    lit('strokes.push({ c: currentColor, s: currentSize, a: currentOpacity, sm: false, fl: isFilled, p: pts });',
        'strokes.push({ c: currentColor, s: currentSize, a: currentOpacity, sm: false, fl: isFilled, p: pts }); haptic(8);', label="shape commit")

    # ---------------- shapes ----------------
    rx(r'function setTool\(tool\) \{.*?(?=function cycleSymmetry\(\) \{)', SETTOOL_JS, label="setTool region")
    rx(r'function buildShapePoints\(.*?(?=function hexToRgba\()', SHAPES_JS, label="buildShapePoints region")
    rx(r'currentTool === "line"\s*\|\|\s*currentTool === "rect"\s*\|\|\s*currentTool === "circle"',
       'isShapeTool(currentTool)', count=3, label="shape tool conditionals")
    rx(r'shapeFilled && \(currentTool === "rect" \|\| currentTool === "circle"\)',
       'shapeFilled && isShapeTool(currentTool) && currentTool !== "line"', count=2, label="isFilled")
    rx(r'(buildShapePoints\(currentTool, shapeStart, [^;\n]*?), shiftPressed\)',
       lambda m: m.group(1) + ', shiftPressed || shapeLock)', count=2, label="shift/lock")
    lit('o: "circle", g: "fill"', 'o: "circle", t: "triangle", s: "shape", g: "fill"', label="keyMap")
    lit('document.getElementById("shape-fill-btn").classList.toggle("active", shapeFilled);',
        'document.querySelectorAll("#shape-fill-btn, .shape-fill-toggle").forEach(b => b.classList.toggle("active", shapeFilled));\n'
        '                            const sg = document.getElementById("shape-grid"); if (sg) sg.classList.toggle("filled", shapeFilled);',
        label="toggleShapeFill")

    # ---------------- history hook / layers / init ----------------
    lit('document.getElementById("redo-btn").disabled = redoStack.length === 0;',
        'document.getElementById("redo-btn").disabled = redoStack.length === 0;\n                            onHistoryChanged();', label="updateHistoryUI")
    lit('row.onclick = () => selectLayer(lyr.id);', 'row.dataset.id = lyr.id;\n                                row.onclick = () => selectLayer(lyr.id);', label="layer row")
    rx(r'initUpgradeControls\(\);', 'initUpgradeControls();\n                            initShapePane();\n                            initLayerDrag();\n                            initDrawHud();', label="init hook")

    # ---------------- eyedropper + trace image ----------------
    rx(r'function pickColorAt\(pt\) \{.*?(?=function applyFloodFill\()', PICK_JS, label="pickColorAt region")
    rx(re.escape('const px = drawCtx.getImageData(clamp(x, 0, 499), clamp(y, 0, 499), 1, 1).data;') + r'\s*' +
       re.escape('fill = px[3] < 20 ? paperBg : `rgb(${px[0]},${px[1]},${px[2]})`;'),
       'const sp = samplePickColor(x, y);\n                                fill = sp ? sp.hex : paperBg;', label="brush-ring loupe")

    # ---------------- remove bubble + perspective stencils ----------------
    rx(r'\n[ \t]*grid:[^\n]*perspectiveLines[^\n]*', '', label="stencil: grid")
    rx(r'\n[ \t]*bubble:[^\n]*', '', label="stencil: bubble")
    rx(r'function perspectiveLines\(\) \{.*?\n[ \t]*\}\n', '', label="perspectiveLines()")

    # ---------------- settings: options / minimap / weather ----------------
    rx(r'function applyOptions\(\) \{.*?(?=let texts = \[\];)', OPTIONS_JS, label="applyOptions/loadOptions region")
    lit('if (mmRaf) return;', 'if (!minimapOn || mmRaf) return;', label="updateMinimap")
    lit('return weatherOverride === "auto" ? liveWeatherState.mode : weatherOverride;',
        'if (!weatherOn) return "clear";\n                            return weatherOverride === "auto" ? liveWeatherState.mode : weatherOverride;', label="getActiveWeatherMode")
    lit('if (cvs.width !== window.innerWidth || cvs.height !== window.innerHeight) {',
        'if (!weatherOn) { ctx.clearRect(0, 0, cvs.width, cvs.height); weatherRaf = null; return; }\n'
        '                                if (cvs.width !== window.innerWidth || cvs.height !== window.innerHeight) {', label="weather tick guard")
    lit('window.addEventListener("resize", rebuildWeatherParticles);',
        'if (!window.__wxResize) { window.__wxResize = true; window.addEventListener("resize", rebuildWeatherParticles); }', label="weather resize")
    rx(r'startWeatherEngine\(\);\s*if \(navigator\.geolocation\) \{.*?\n\s*\} else \{\s*syncLiveWeather\(\);\s*\}',
       BOTTOM_WEATHER_JS, label="weather boot block")

    # ---------------- wall reactions ----------------
    lit('stage.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;',
        'stage.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;\n'
        '                            stage.style.setProperty("--pill-s", Math.min(2.5, 1 / scale).toFixed(3));\n'
        '                            stage.classList.toggle("far", scale < 0.28);', label="applyStageTransform")

    # ---------------- v3 runtime block ----------------
    lit('const APK_DOWNLOAD_URL', V3_JS + 'const APK_DOWNLOAD_URL', label="APK anchor")


def node_check(text):
    if not shutil.which("node"):
        print("node not found, skipping JS syntax check"); return True
    ok = True
    for i, m in enumerate(re.finditer(r'<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>', text, re.S)):
        with tempfile.NamedTemporaryFile("w", suffix=".js", delete=False, encoding="utf-8") as f:
            f.write(m.group(1)); path = f.name
        r = subprocess.run(["node", "--check", path], capture_output=True, text=True,
                           encoding="utf-8", errors="replace")
        if r.returncode:
            ok = False
            print(f"JS syntax error in <script> #{i}:\n{r.stderr[:1200]}")
    return ok

def main():
    global html
    if len(sys.argv) < 2:
        print(__doc__); sys.exit(1)
    src = pathlib.Path(sys.argv[1])
    out = pathlib.Path(sys.argv[2]) if len(sys.argv) > 2 else src.with_name(src.stem + "_v3.html")
    html = src.read_text(encoding="utf-8").replace("\r\n", "\n")
    apply_patches()
    if errors:
        print("ABORTED, nothing written. Anchors that did not match:")
        for e in errors: print("  -", e)
        sys.exit(2)
    if not node_check(html):
        print("ABORTED: patched JS has a syntax error (see above). Nothing written.")
        sys.exit(3)
    out.write_text(html, encoding="utf-8")
    print(f"OK -> {out}  ({len(html)//1024} KB)")

if __name__ == "__main__":
    main()