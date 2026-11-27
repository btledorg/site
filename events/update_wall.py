#!/usr/bin/env python3
import os
import re
import subprocess
import sys
import tempfile

TARGET = sys.argv[1] if len(sys.argv) > 1 else "freedomwall.html"

PATCH_JS = r"""
/* =====================================================================
   ARCHERSTUDIO PERFORMANCE & NATIVE SHAPE PATCH (v2026.11.27)
   1. Offscreen tile bitmap cache + viewport culling (eliminates wall lag)
   2. Shapes paste directly into active layer strokes (erasable & native)
   ===================================================================== */
(function () {
    "use strict";

    // --- 1. TILE BITMAP CACHE & VIEWPORT CULLING ---
    var tileBitmapCache = new Map();
    var MAX_CACHE_TILES = 120;

    function tileCacheKey(entry) {
        if (!entry) return "";
        var ver = entry.updatedAt || entry.ts || (entry.strokes ? entry.strokes.length : 0);
        return String(entry.id || entry.slot || "") + ":" + String(ver);
    }

    function getCachedTileCanvas(entry, renderFn) {
        var key = tileCacheKey(entry);
        if (tileBitmapCache.has(key)) {
            var hit = tileBitmapCache.get(key);
            // Refresh LRU order
            tileBitmapCache.delete(key);
            tileBitmapCache.set(key, hit);
            return hit;
        }
        var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
        var size = Math.round(250 * dpr);
        var off = document.createElement("canvas");
        off.width = size;
        off.height = size;
        var octx = off.getContext("2d");
        octx.scale(size / 500, size / 500);
        renderFn(octx, entry);

        if (tileBitmapCache.size >= MAX_CACHE_TILES) {
            var oldest = tileBitmapCache.keys().next().value;
            tileBitmapCache.delete(oldest);
        }
        tileBitmapCache.set(key, off);
        return off;
    }

    window.invalidateTileCache = function (entryId) {
        if (!entryId) { tileBitmapCache.clear(); return; }
        Array.from(tileBitmapCache.keys()).forEach(function (k) {
            if (k.indexOf(String(entryId) + ":") === 0) tileBitmapCache.delete(k);
        });
    };

    // Wrap wall tile renderer if exposed so offscreen bitmaps + culling apply automatically
    if (typeof window.drawWallTile === "function") {
        var _origDrawWallTile = window.drawWallTile;
        window.drawWallTile = function (ctx, entry, x, y, w, h, viewBounds) {
            if (viewBounds) {
                if (x + w < viewBounds.left || x > viewBounds.right ||
                    y + h < viewBounds.top || y > viewBounds.bottom) {
                    return; // Cull off-screen tile
                }
            }
            var bmp = getCachedTileCanvas(entry, function (octx, ent) {
                _origDrawWallTile(octx, ent, 0, 0, 500, 500, null);
            });
            ctx.drawImage(bmp, x, y, w, h);
        };
    }

    // Throttle high-frequency wall pan/zoom repaints to 1 per animation frame
    if (typeof window.renderWall === "function") {
        var _origRenderWall = window.renderWall;
        var wallRafPending = false;
        window.renderWall = function (immediate) {
            if (immediate === true) {
                wallRafPending = false;
                return _origRenderWall.apply(this, arguments);
            }
            if (wallRafPending) return;
            wallRafPending = true;
            requestAnimationFrame(function () {
                wallRafPending = false;
                _origRenderWall.call(window);
            });
        };
    }

    // --- 2. PASTE SHAPES INTO CURRENT LAYER (NO SEPARATE SHAPE LAYER, ERASABLE) ---
    function getTargetDrawingLayer() {
        if (typeof activeLayer === "function") {
            var a = activeLayer();
            if (a && !a.locked) return a;
        }
        if (Array.isArray(window.layers) && window.layers.length) {
            var idx = typeof window.activeLayerIdx === "number" ? window.activeLayerIdx : 0;
            var lyr = window.layers[idx] || window.layers[0];
            if (lyr) return lyr;
        }
        return null;
    }

    function commitShapeToCurrentLayer(sh) {
        if (!sh || typeof window.shapeToStroke !== "function") return false;
        var target = getTargetDrawingLayer();
        if (!target) return false;

        var stroke = window.shapeToStroke(sh);
        // Mark as regular vector stroke so standard eraser/replay handles it
        stroke.erased = false;
        stroke.fromShape = true;

        if (!Array.isArray(target.strokes)) target.strokes = [];
        target.strokes.push(stroke);

        // Remove any temporary shape-only layer wrapper if the host script created one
        if (Array.isArray(window.layers)) {
            for (var i = window.layers.length - 1; i >= 0; i--) {
                if (window.layers[i] && window.layers[i].shape && window.layers[i] !== target) {
                    window.layers.splice(i, 1);
                }
            }
        }

        if (typeof window.selectShape === "function") window.selectShape(null);
        if (typeof window.pushUndo === "function") window.pushUndo();
        if (typeof window.renderStudio === "function") window.renderStudio();
        if (typeof window.renderLayersUI === "function") window.renderLayersUI();
        return true;
    }

    // Intercept shape finalization / layer creation so shapes merge into active layer
    if (typeof window.finalizeShape === "function") {
        var _origFinalizeShape = window.finalizeShape;
        window.finalizeShape = function (sh) {
            var shapeObj = sh || (typeof window.selectedShape === "function" && window.selectedShape() && window.selectedShape().shape);
            if (shapeObj && commitShapeToCurrentLayer(shapeObj)) return;
            return _origFinalizeShape.apply(this, arguments);
        };
    }

    if (typeof window.addShapeLayer === "function") {
        window.addShapeLayer = function (sh) {
            if (!commitShapeToCurrentLayer(sh)) {
                var target = getTargetDrawingLayer();
                if (target && Array.isArray(target.strokes) && typeof window.shapeToStroke === "function") {
                    target.strokes.push(window.shapeToStroke(sh));
                }
            }
        };
    }

    // Ensure eraser checks all strokes in the active layer, including pasted shapes
    if (typeof window.eraseAtPoint === "function") {
        var _origEraseAtPoint = window.eraseAtPoint;
        window.eraseAtPoint = function (pt, radius) {
            var target = getTargetDrawingLayer();
            if (target && Array.isArray(target.strokes)) {
                var r = radius || (window.brushSize || 12) / 2;
                var changed = false;
                for (var i = target.strokes.length - 1; i >= 0; i--) {
                    var st = target.strokes[i];
                    if (!st || !Array.isArray(st.p)) continue;
                    // Split or remove stroke segments hit by the eraser
                    var remaining = [];
                    var currentSeg = [];
                    for (var j = 0; j < st.p.length; j++) {
                        var p = st.p[j];
                        var dx = p[0] - pt[0], dy = p[1] - pt[1];
                        if (dx * dx + dy * dy <= r * r) {
                            changed = true;
                            if (currentSeg.length > 1) remaining.push(currentSeg);
                            currentSeg = [];
                        } else {
                            currentSeg.push(p);
                        }
                    }
                    if (currentSeg.length > 1) remaining.push(currentSeg);
                    if (changed) {
                        if (remaining.length === 0) {
                            target.strokes.splice(i, 1);
                        } else {
                            var clones = remaining.map(function (seg) {
                                return Object.assign({}, st, { p: seg });
                            });
                            Array.prototype.splice.apply(target.strokes, [i, 1].concat(clones));
                        }
                    }
                }
                if (changed) {
                    if (typeof window.renderStudio === "function") window.renderStudio();
                    return;
                }
            }
            return _origEraseAtPoint.apply(this, arguments);
        };
    }
})();
"""


def validate_js(js_code: str) -> None:
    with tempfile.NamedTemporaryFile("w", suffix=".js", delete=False, encoding="utf-8") as tmp:
        tmp.write(js_code)
        tmp_path = tmp.name
    try:
        subprocess.run(["node", "--check", tmp_path], check=True, capture_output=True, text=True)
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)


def main() -> None:
    if not os.path.exists(TARGET):
        print(f"Error: {TARGET} not found.", file=sys.stderr)
        sys.exit(1)

    with open(TARGET, "r", encoding="utf-8") as f:
        html = f.read()

    # Validate patch syntax with node --check before touching freedomwall.html
    validate_js(PATCH_JS)

    marker = "ARCHERSTUDIO PERFORMANCE & NATIVE SHAPE PATCH"
    if marker in html:
        html = re.sub(
            r"/\* =+\s*ARCHERSTUDIO PERFORMANCE & NATIVE SHAPE PATCH[\s\S]*?\}\)\(\);\s*",
            PATCH_JS.strip() + "\n",
            html,
            count=1,
        )
    else:
        idx = html.rfind("</script>")
        if idx == -1:
            print("Error: No closing </script> tag found in target HTML.", file=sys.stderr)
            sys.exit(1)
        html = html[:idx] + "\n" + PATCH_JS.strip() + "\n" + html[idx:]

    # Validate all inline scripts in the resulting HTML
    scripts = re.findall(r"<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)</script>", html, flags=re.IGNORECASE)
    for i, block in enumerate(scripts, 1):
        if block.strip():
            validate_js(block)

    with open(TARGET, "w", encoding="utf-8") as f:
        f.write(html)

    print(f"Successfully patched and verified {TARGET} ({len(scripts)} inline script blocks checked).")


if __name__ == "__main__":
    main()