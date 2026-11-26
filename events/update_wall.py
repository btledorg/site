import re
import sys
from pathlib import Path

NEW_DRAW_HANDLERS = r'''let pendingTouchStroke = null;

function commitPendingTouchStroke() {
    if (!pendingTouchStroke) return;
    const { stroke, mirrors } = pendingTouchStroke;
    pendingTouchStroke = null;
    redoStack = [];
    if (!stroke.er) rememberUsedColor(stroke.c);
    strokes.push(stroke);
    mirrors.forEach(ms => strokes.push(ms));
    currentStroke = stroke;
    mirrorStrokes = mirrors;
    committedCount = -1;
}

function startDraw(e) {
    if (isPreviewing) return;

    // 2+ fingers: cancel any buffered/accidental 1-finger touch dot and switch to pinch-pan/zoom
    if (e.touches && e.touches.length >= 2) {
        e.preventDefault();
        pendingTouchStroke = null;
        if (isDrawing && currentStroke) {
            strokes.pop();
            mirrorStrokes.forEach(() => strokes.pop());
            committedCount = -1;
            redrawStudio();
            updateHistoryUI();
        }
        isDrawing = false;
        currentStroke = null;
        mirrorStrokes = [];
        shapeStart = null;
        previewCtx.clearRect(0, 0, 500, 500);

        const rect = canvasFrame.getBoundingClientRect();
        studioPinchDist = Math.hypot(
            e.touches[0].clientX - e.touches[1].clientX,
            e.touches[0].clientY - e.touches[1].clientY
        );
        studioPinchMidX = ((e.touches[0].clientX + e.touches[1].clientX) / 2) - rect.left;
        studioPinchMidY = ((e.touches[0].clientY + e.touches[1].clientY) / 2) - rect.top;
        return;
    }

    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    // Hand tool OR Spacebar/Middle-click pan: never draw
    if (currentTool === "hand" || (!e.touches && (spacePressed || e.button === 1))) {
        e.preventDefault();
        deselectText();
        isDrawing = false;
        currentStroke = null;
        pendingTouchStroke = null;
        isStudioPanning = true;
        studioPanStartX = clientX - studioPanX;
        studioPanStartY = clientY - studioPanY;
        canvasFrame.classList.add("panning");
        return;
    }

    if (e.button !== undefined && e.button !== 0) return;

    e.preventDefault();
    deselectText();
    const pt = getCanvasPoint(e);

    if (currentTool === "eyedropper") { pickColorAt(pt); return; }

    if (currentTool === "fill") {
        redoStack = [];
        rememberUsedColor(currentColor);
        strokes.push({ k: "fill", c: currentColor, a: currentOpacity, x: pt[0], y: pt[1] });
        committedCount = -1;
        redrawStudio();
        updateHistoryUI();
        scheduleDraftSave();
        return;
    }

    if (currentTool === "line" || currentTool === "rect" || currentTool === "circle") {
        isDrawing = true;
        shapeStart = pt;
        return;
    }

    isDrawing = true;
    const isEraser = currentTool === "eraser";
    const symPts = getSymmetricPoints(pt);

    const baseStroke = {
        c: isEraser ? "#ffffff" : currentColor,
        s: currentSize,
        a: isEraser ? 1 : currentOpacity,
        er: isEraser,
        sm: !isEraser && smoothStrokes,
        p: [symPts[0]]
    };

    const mirrors = [];
    for (let i = 1; i < symPts.length; i++) {
        mirrors.push({
            c: baseStroke.c,
            s: baseStroke.s,
            a: baseStroke.a,
            er: baseStroke.er,
            sm: baseStroke.sm,
            p: [symPts[i]]
        });
    }

    // Buffer touch strokes briefly so placing 2 fingers to pan never leaves/erases a dot
    if (e.touches) {
        pendingTouchStroke = { stroke: baseStroke, mirrors };
        currentStroke = null;
        mirrorStrokes = [];
    } else {
        redoStack = [];
        if (!isEraser) rememberUsedColor(currentColor);
        strokes.push(baseStroke);
        mirrors.forEach(ms => strokes.push(ms));
        currentStroke = baseStroke;
        mirrorStrokes = mirrors;
        committedCount = -1;
        redrawStudio();
        updateHistoryUI();
    }
}

function moveDraw(e) {
    if (e.touches && e.touches.length >= 2 && studioPinchDist) {
        e.preventDefault();
        const rect = canvasFrame.getBoundingClientRect();
        const newDist = Math.hypot(
            e.touches[0].clientX - e.touches[1].clientX,
            e.touches[0].clientY - e.touches[1].clientY
        );
        const newMidX = ((e.touches[0].clientX + e.touches[1].clientX) / 2) - rect.left;
        const newMidY = ((e.touches[0].clientY + e.touches[1].clientY) / 2) - rect.top;

        studioPanX += (newMidX - studioPinchMidX);
        studioPanY += (newMidY - studioPinchMidY);

        const factor = newDist / studioPinchDist;
        zoomStudioAt(studioScale * factor, newMidX, newMidY);

        studioPinchDist = newDist;
        studioPinchMidX = newMidX;
        studioPinchMidY = newMidY;
        return;
    }

    if (isStudioPanning) {
        e.preventDefault();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        const dx = clientX - studioPanStartX;
        const dy = clientY - studioPanStartY;

        if (studioScale <= 1.001 && typeof refState !== "undefined" && refState.loaded && refState.visible) {
            refState.x += dx - studioPanX;
            refState.y += dy - studioPanY;
            studioPanX = dx;
            studioPanY = dy;
            if (typeof updateRefTransform === "function") updateRefTransform();
        } else {
            studioPanX = dx;
            studioPanY = dy;
            applyStudioTransform();
        }
        return;
    }

    if (!isDrawing || isPreviewing) return;
    e.preventDefault();
    const pt = getCanvasPoint(e);

    if (shapeStart && (currentTool === "line" || currentTool === "rect" || currentTool === "circle")) {
        const pts = buildShapePoints(currentTool, shapeStart, pt, shiftPressed);
        const isFilled = shapeFilled && (currentTool === "rect" || currentTool === "circle");
        renderStrokesInstant(previewCtx, [{ c: currentColor, s: currentSize, a: currentOpacity, sm: false, fl: isFilled, p: pts }], 500, true);
        return;
    }

    if (pendingTouchStroke) {
        const startPt = pendingTouchStroke.stroke.p[0];
        if (Math.hypot(pt[0] - startPt[0], pt[1] - startPt[1]) < 2) return;
        commitPendingTouchStroke();
        updateHistoryUI();
    }

    if (!currentStroke) return;
    const last = currentStroke.p[currentStroke.p.length - 1];
    const minStep = studioScale > 1.5 ? 1 : 2;
    if (Math.hypot(pt[0] - last[0], pt[1] - last[1]) >= minStep) {
        const symPts = getSymmetricPoints(pt);
        currentStroke.p.push(symPts[0]);
        for (let i = 0; i < mirrorStrokes.length; i++) {
            if (symPts[i + 1]) mirrorStrokes[i].p.push(symPts[i + 1]);
        }
        scheduleStudioRedraw();
    }
}

function endDraw(e) {
    if (e && e.touches && e.touches.length < 2) studioPinchDist = null;
    if (isStudioPanning) {
        isStudioPanning = false;
        if (studioScale <= 1.001) {
            studioPanX = 0;
            studioPanY = 0;
        }
        canvasFrame.classList.remove("panning");
        return;
    }

    if (isDrawing && shapeStart && (currentTool === "line" || currentTool === "rect" || currentTool === "circle")) {
        previewCtx.clearRect(0, 0, 500, 500);
        const rect = drawCanvas.getBoundingClientRect();
        const pt = e && e.changedTouches
            ? [
                Math.max(0, Math.min(500, Math.round(((e.changedTouches[0].clientX - rect.left) / rect.width) * 500))),
                Math.max(0, Math.min(500, Math.round(((e.changedTouches[0].clientY - rect.top) / rect.height) * 500)))
              ]
            : getCanvasPoint(e);

        const pts = buildShapePoints(currentTool, shapeStart, pt || shapeStart, shiftPressed);
        const isFilled = shapeFilled && (currentTool === "rect" || currentTool === "circle");
        redoStack = [];
        rememberUsedColor(currentColor);
        strokes.push({ c: currentColor, s: currentSize, a: currentOpacity, sm: false, fl: isFilled, p: pts });
        shapeStart = null;
        isDrawing = false;
        committedCount = -1;
        redrawStudio();
        updateHistoryUI();
        scheduleDraftSave();
        return;
    }

    if (pendingTouchStroke) {
        commitPendingTouchStroke();
    }

    if (!isDrawing) return;
    isDrawing = false;
    currentStroke = null;
    mirrorStrokes = [];
    shapeStart = null;
    committedCount = -1;
    redrawStudio();
    updateHistoryUI();
    scheduleDraftSave();
}'''

def main():
    if len(sys.argv) < 2:
        print("Usage: python fix_hand_pan.py freedomwall.html")
        sys.exit(1)

    target = Path(sys.argv[1])
    if not target.exists():
        print(f"Error: File not found: {target}")
        sys.exit(1)

    html = target.read_text(encoding="utf-8")

    # Match from `function startDraw(e)` through the end of `function endDraw(e)`
    pattern = re.compile(
        r"(?:let\s+pendingTouchStroke\s*=[\s\S]*?)?function\s+startDraw\s*\(e\)\s*\{[\s\S]*?function\s+endDraw\s*\(e\)\s*\{[\s\S]*?scheduleDraftSave\(\);\s*\}",
        re.MULTILINE
    )

    if not pattern.search(html):
        print("Error: Could not locate startDraw..endDraw block in the HTML file.")
        sys.exit(1)

    backup = target.with_suffix(target.suffix + ".bak")
    backup.write_text(html, encoding="utf-8")

    updated = pattern.sub(lambda _: NEW_DRAW_HANDLERS, html, count=1)
    target.write_text(updated, encoding="utf-8")

    print(f"Patched {target} successfully (backup saved to {backup}).")

if __name__ == "__main__":
    main()