import sys
from pathlib import Path

TARGET_FILE = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("freedomwall.html")
if not TARGET_FILE.exists():
    print(f"Error: '{TARGET_FILE}' not found.")
    sys.exit(1)

html = TARGET_FILE.read_text(encoding="utf-8")
original = html

# 1. Remove particle creation for "clear" in rebuildWeatherParticles()
old_clear_spawn = """                            } else {
                                // Clear / Sunny: warm floating ambient motes + subtle sunbeams
                                for (let i = 0; i < 28; i++) {
                                    weatherParticles.push({
                                        x: Math.random() * cvs.width,
                                        y: Math.random() * cvs.height,
                                        r: 2 + Math.random() * 3.5,
                                        vy: -0.18 - Math.random() * 0.32,
                                        phase: Math.random() * Math.PI * 2,
                                        alpha: 0.28 + Math.random() * 0.35
                                    });
                                }
                            }"""

if old_clear_spawn in html:
    html = html.replace(old_clear_spawn, "                            }", 1)
    print("[OK] Removed clear-weather particle spawning.")

# 2. Remove sunbeam & mote rendering in startWeatherEngine()
old_clear_render = """                                if (mode === "clear") {
                                    // Top-right warm sunbeam glow
                                    const sunGrad = ctx.createRadialGradient(
                                        cvs.width * 0.88, 45, 10,
                                        cvs.width * 0.88, 45, Math.max(cvs.width, cvs.height) * 0.55
                                    );
                                    sunGrad.addColorStop(0, `rgba(253, 224, 71, ${0.22 * viewAlphaScale})`);
                                    sunGrad.addColorStop(0.5, `rgba(254, 240, 138, ${0.08 * viewAlphaScale})`);
                                    sunGrad.addColorStop(1, "rgba(254, 240, 138, 0)");
                                    ctx.fillStyle = sunGrad;
                                    ctx.fillRect(0, 0, cvs.width, cvs.height);

                                    // Floating golden ambient motes
                                    for (const p of weatherParticles) {
                                        p.y += p.vy;
                                        p.phase += 0.025;
                                        p.x += Math.sin(p.phase) * 0.45;
                                        if (p.y < -10) { p.y = cvs.height + 10; p.x = Math.random() * cvs.width; }
                                        ctx.fillStyle = `rgba(245, 158, 11, ${p.alpha * viewAlphaScale})`;
                                        ctx.beginPath();
                                        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
                                        ctx.fill();
                                    }
                                } else if (mode === "cloudy") {"""

if old_clear_render in html:
    html = html.replace(old_clear_render, '                                if (mode === "cloudy") {', 1)
    print("[OK] Removed clear-weather canvas rendering.")

if html != original:
    TARGET_FILE.write_text(html, encoding="utf-8")
    print(f"[DONE] Successfully updated '{TARGET_FILE}'.")
else:
    print("[INFO] Clear-weather particles were already removed.")