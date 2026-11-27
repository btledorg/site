import re
import shutil
import sys
from pathlib import Path

# This file contains the replay patch; keep the other patch sections optional.
CSS = ""
JS = ""

REPLAY_JS = r"""
(function () {
  "use strict";
  var ORIG = window.renderStrokesInstant;
  if (typeof ORIG !== "function" || window.__layeredReplay) return;
  window.__layeredReplay = true;

  // ---------- small canvas pool (scratch canvases, keyed by size) ----------
  var pool = {};
  function poolCanvas(key, dim, readback) {
    var id = key + dim, p = pool[id];
    if (!p) {
      if (Object.keys(pool).length > 10) {
        Object.keys(pool).forEach(function (k) { pool[k].cv.width = 0; });
        pool = {};
      }
      var cv = document.createElement("canvas");
      cv.width = cv.height = dim;
      p = pool[id] = { cv: cv, ctx: cv.getContext("2d", readback ? { willReadFrequently: true } : undefined) };
    }
    return p;
  }

  // ======================================================================
  // 1. POSTED DATA KEEPS ITS LAYERS ({k:"ly"} marker before each layer)
  // ======================================================================
  window.getAllFlattenedStrokes = function (includeHidden) {
    var out = [];
    layers.forEach(function (lyr) {
      if (!includeHidden && !lyr.visible) return;
      var items = null;
      if (lyr.type === "draw") {
        items = lyr.strokes;
      } else if (lyr.type === "text" && lyr.textItem && (lyr.textItem.t || "").trim()) {
        var t = lyr.textItem;
        items = [{ k: "text", t: t.t.slice(0, 120), x: Math.round(t.x), y: Math.round(t.y), c: t.c, f: t.f, fn: t.fn || "Inter" }];
      }
      if (!items || !items.length) return;
      out.push({ k: "ly" });
      for (var i = 0; i < items.length; i++) out.push(items[i]);
    });
    return out;
  };

  // ======================================================================
  // 2. LAYER-AWARE RENDER (each layer on its own canvas, then composited)
  // ======================================================================
  function hasMarks(list) {
    for (var i = 0; i < list.length; i++) if (list[i] && list[i].k === "ly") return true;
    return false;
  }

  window.renderStrokesInstant = function (ctx, list, dim, clear) {
    if (clear === undefined) clear = true;
    if (!list || !list.length || !hasMarks(list)) return ORIG(ctx, list, dim, clear);
    if (clear) ctx.clearRect(0, 0, dim, dim);
    var sc = poolCanvas("r", dim, true);
    var group = [];
    function flush() {
      if (!group.length) return;
      sc.ctx.clearRect(0, 0, dim, dim);
      ORIG(sc.ctx, group, dim, false);
      ctx.save();
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      ctx.drawImage(sc.cv, 0, 0);
      ctx.restore();
      group = [];
    }
    for (var i = 0; i < list.length; i++) {
      var st = list[i];
      if (!st || st.k === "bg") continue;
      if (st.k === "ly") { flush(); continue; }
      group.push(st);
    }
    flush();
  };

  // ======================================================================
  // 3. REPLAY ENGINE
  // ======================================================================
  function makeReplay(strokeList, dim) {
    var groups = [], items = [], cur = null, total = 0;
    (strokeList || []).forEach(function (st) {
      if (!st || st.k === "bg") return;
      if (st.k === "ly") { cur = null; return; }
      var units;
      if (st.k === "text") units = Math.max(1, String(st.t || "").length);
      else if (st.k === "fill") units = 1;
      else if (st.p && st.p.length) units = st.p.length > 1 ? st.p.length - 1 : 1;
      else return;
      if (!cur) { cur = { cv: null, ctx: null, fill: false }; groups.push(cur); }
      if (st.k === "fill") cur.fill = true;
      items.push({ g: cur, st: st, units: units });
      total += units;
    });

    var out = document.createElement("canvas");
    out.width = out.height = dim;
    var octx = out.getContext("2d");
    var idx = 0, done = 0, committed = 0;

    function ensure(g) {
      if (!g.cv) {
        g.cv = document.createElement("canvas");
        g.cv.width = g.cv.height = dim;
        g.ctx = g.cv.getContext("2d", g.fill ? { willReadFrequently: true } : undefined);
      }
      return g;
    }
    function commit() {
      while (committed < idx) {
        var it = items[committed++];
        ensure(it.g);
        ORIG(it.g.ctx, [it.st], dim, false);
      }
    }
    function partial(it) {
      var st = it.st;
      if (st.k === "text") return Object.assign({}, st, { t: String(st.t || "").slice(0, done) });
      return Object.assign({}, st, { p: st.p.slice(0, done + 1) });
    }

    return {
      total: total,
      out: out,
      advance: function (n) {
        while (n > 0 && idx < items.length) {
          var left = items[idx].units - done;
          if (n >= left) { n -= left; idx++; done = 0; }
          else { done += n; n = 0; }
        }
        return idx >= items.length;
      },
      render: function () {
        commit();
        octx.clearRect(0, 0, dim, dim);
        var live = (idx < items.length && done > 0) ? items[idx] : null;
        for (var i = 0; i < groups.length; i++) {
          var g = groups[i];
          if (live && live.g === g) {
            ensure(g);
            var sc = poolCanvas("p", dim, false);
            sc.ctx.clearRect(0, 0, dim, dim);
            sc.ctx.drawImage(g.cv, 0, 0);
            ORIG(sc.ctx, [partial(live)], dim, false);
            octx.drawImage(sc.cv, 0, 0);
          } else if (g.cv) {
            octx.drawImage(g.cv, 0, 0);
          }
        }
      },
      dispose: function () {
        groups.forEach(function (g) { if (g.cv) { g.cv.width = 0; g.cv = g.ctx = null; } });
      }
    };
  }

  window.animateStrokes = function (ctx, strokeList, canvasDim, speedMultiplier, onComplete) {
    if (speedMultiplier == null) speedMultiplier = 1;
    ctx.clearRect(0, 0, canvasDim, canvasDim);
    var rp = makeReplay(strokeList, canvasDim);
    if (!rp.total) {
      if (onComplete) onComplete();
      return { cancel: function () {} };
    }
    var per = Math.max(1, Math.ceil((rp.total / 95) * speedMultiplier));
    var raf = 0, cancelled = false;
    function frame() {
      if (cancelled) return;
      var finished = rp.advance(per);
      rp.render();
      ctx.clearRect(0, 0, canvasDim, canvasDim);
      ctx.drawImage(rp.out, 0, 0);
      if (!finished) { raf = requestAnimationFrame(frame); return; }
      rp.dispose();
      if (onComplete) onComplete();
    }
    raf = requestAnimationFrame(frame);
    return { cancel: function () { cancelled = true; cancelAnimationFrame(raf); rp.dispose(); } };
  };

  var liveJobs = [];
  window.startUnifiedWallReplay = function (entriesToPlay) {
    if (batchReplayRaf) { cancelAnimationFrame(batchReplayRaf); batchReplayRaf = 0; }
    liveJobs.forEach(function (j) { j.rp.dispose(); });
    activeReplayAnims.clear();

    var dim = scale < 0.45 ? 160 : 220;
    var t0 = performance.now();
    var jobs = [];
    entriesToPlay.forEach(function (entry, index) {
      var rp = makeReplay(entry.strokes, dim);
      if (!rp.total) return;
      activeReplayAnims.set(entry.id, rp.out);
      jobs.push({
        entry: entry, rp: rp, done: false,
        delay: Math.min(index * 28, 1200),
        rate: Math.max(1, Math.ceil((rp.total / 80) * 1.25))
      });
    });
    liveJobs = jobs;

    function tick(now) {
      var remaining = 0;
      var vw = wallViewport.clientWidth || window.innerWidth;
      var vh = wallViewport.clientHeight || window.innerHeight;
      var ts = CELL_SIZE * scale;

      for (var i = 0; i < jobs.length; i++) {
        var job = jobs[i];
        if (job.done) continue;
        if (now - t0 < job.delay) { remaining++; continue; }

        var sx = job.entry.gx * ts + panX, sy = job.entry.gy * ts + panY;
        var inView = !(sx + ts < -60 || sx > vw + 60 || sy + ts < -60 || sy > vh + 60);

        var finished = job.rp.advance(job.rate);
        if (finished) {
          job.done = true;
          job.rp.dispose();
          activeReplayAnims.delete(job.entry.id);
          tileBitmapCache.delete(job.entry.id);
          getCachedTileCanvas(job.entry);
        } else {
          if (inView) job.rp.render();
          remaining++;
        }
      }
      paintWallViewport();
      batchReplayRaf = remaining > 0 ? requestAnimationFrame(tick) : 0;
    }

    paintWallViewport();
    if (jobs.length) batchReplayRaf = requestAnimationFrame(tick);
  };

  try { tileBitmapCache.clear(); scheduleWallPaint(); } catch (e) {}
})();
"""


def main():
    default_target = Path(__file__).resolve().parent / "freedomwall.html"
    path = Path(sys.argv[1]) if len(sys.argv) > 1 else default_target
    if not path.is_file():
        sys.exit(f"File not found: {path}")

    html = path.read_text(encoding="utf-8")
    if "</head>" not in html or "</body>" not in html:
        sys.exit("This does not look like freedomwall.html (missing </head> or </body>).")

    bak = Path(str(path) + ".bak")
    if not bak.exists():
        shutil.copyfile(path, bak)

    for pat in (
        r'<style id="artcher-events2">.*?</style>\n?',
        r'<script id="artcher-events2-js">.*?</script>\n?',
        r'<script id="artcher-replay-js">.*?</script>\n?',
    ):
        html = re.sub(pat, "", html, flags=re.S)

    head_end = html.index("</head>")
    html = html[:head_end] + '<style id="artcher-events2">' + CSS + "</style>\n" + html[head_end:]

    body_end = html.rindex("</body>")
    html = (
        html[:body_end]
        + '<script id="artcher-events2-js">' + JS + "</script>\n"
        + '<script id="artcher-replay-js">' + REPLAY_JS + "</script>\n"
        + html[body_end:]
    )

    path.write_text(html, encoding="utf-8")
    print(f"Patched {path} (backup: {bak})")


if __name__ == "__main__":
    main()