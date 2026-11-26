import sys
from pathlib import Path

TARGET_FILE = sys.argv[1] if len(sys.argv) > 1 else "freedomwall.html"
path = Path(TARGET_FILE)

if not path.exists():
    print(f"Error: '{TARGET_FILE}' not found. Pass your HTML filename: python apply_patch.py yourfile.html")
    sys.exit(1)

html = path.read_text(encoding="utf-8")

# 1. CSS for Seasonal Banner, Ambient Particles & Theme Accents
SEASONAL_CSS = """
        /* ===== SEASONAL & HOLIDAY ENGINE ===== */
        #seasonal-canvas {
            position: fixed;
            inset: 0;
            pointer-events: none;
            z-index: 90;
        }
        .season-pill {
            display: inline-flex;
            align-items: center;
            gap: 5px;
            padding: 3px 9px;
            border-radius: 999px;
            background: var(--accent-soft);
            border: 1px solid var(--border);
            color: var(--accent);
            font-size: 11px;
            font-weight: 700;
            white-space: nowrap;
        }
        .season-banner {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 6px 14px;
            border-radius: 999px;
            background: var(--accent-soft);
            border: 1px solid var(--border);
            color: var(--accent);
            font-size: 12px;
            font-weight: 700;
            margin-bottom: 14px;
        }
"""

# 2. Topbar Pill, Home Banner, Ambient Canvas & More Tab Season Switcher
SEASONAL_TOPBAR_TARGET = """                            <div style="display:flex;align-items:center;gap:8px;">"""
SEASONAL_TOPBAR_REPLACE = """                            <div style="display:flex;align-items:center;gap:8px;">
                                <span class="season-pill" id="season-pill" hidden></span>"""

SEASONAL_HOME_TARGET = """                            <div class="landing-card">
                                <h1 class="landing-title">The ARTcher</h1>"""
SEASONAL_HOME_REPLACE = """                            <div class="landing-card">
                                <div class="season-banner" id="season-banner" hidden></div>
                                <h1 class="landing-title">The ARTcher</h1>"""

SEASONAL_MORE_TARGET = """                            <div class="card">
                                <div class="card-head">Options</div>"""
SEASONAL_MORE_REPLACE = """                            <div class="card">
                                <div class="card-head">Seasonal &amp; Holiday Theme</div>
                                <div class="list-row" style="cursor:default;">
                                    <span class="lead">
                                        <span id="season-more-icon" style="font-size:20px;">🗓️</span>
                                        <span>Active Season<small id="season-more-label">Auto-detect (Standard)</small></span>
                                    </span>
                                    <select id="season-preview-select" class="font-select" style="width:auto;min-height:34px;font-size:12px;" onchange="setSeasonOverride(this.value)" aria-label="Preview seasonal theme">
                                        <option value="auto">Auto (Calendar)</option>
                                        <option value="none">Default</option>
                                        <option value="christmas">🎄 Christmas</option>
                                        <option value="newyear">🎆 New Year</option>
                                        <option value="valentines">💖 Valentine's</option>
                                        <option value="halloween">🎃 Halloween</option>
                                        <option value="philippines">🇵🇭 Buwan ng Wika / PH</option>
                                    </select>
                                </div>
                                <label class="list-row">
                                    <span>Seasonal falling effects</span>
                                    <span class="switch"><input type="checkbox" id="opt-season-fx" checked onchange="applySeasonEffectsToggle()"></span>
                                </label>
                            </div>

                            <div class="card">
                                <div class="card-head">Options</div>"""

SEASONAL_CANVAS_TARGET = """                    <canvas id="confetti-canvas"></canvas>"""
SEASONAL_CANVAS_REPLACE = """                    <canvas id="seasonal-canvas"></canvas>
                    <canvas id="confetti-canvas"></canvas>"""

# 3. Seasonal Engine JavaScript
SEASONAL_JS = """
                        // =========================================================================
                        // SEASONAL & HOLIDAY ENGINE
                        // =========================================================================
                        const LS_SEASON_OVERRIDE = "fw_season_override_v1";
                        const LS_SEASON_FX = "fw_season_fx_v1";

                        const SEASONS = {
                            christmas: {
                                id: "christmas",
                                icon: "🎄",
                                name: "Merry Christmas!",
                                pill: "🎄 Holiday Edition",
                                sub: "ARCHERSTUDIO · HOLIDAY WALL",
                                accent: "#dc2626",
                                accentHover: "#b91c1c",
                                accentSoft: "#fef2f2",
                                particle: "snow",
                                colors: ["#dc2626", "#16a34a", "#eab308", "#991b1b"],
                                stencils: {
                                    xmas_tree: ["🎄 Tree", () => `<polygon points="250,55 150,200 205,200 120,320 190,320 95,435 405,435 310,320 380,320 295,200 350,200"/><rect x="225" y="435" width="50" height="45"/>`],
                                    xmas_gift: ["🎁 Gift", () => `<rect x="120" y="180" width="260" height="240" rx="12"/><rect x="105" y="140" width="290" height="45" rx="8"/><line x1="250" y1="140" x2="250" y2="420"/><path d="M250 140 C210 90, 160 110, 195 140 M250 140 C290 90, 340 110, 305 140"/>`]
                                }
                            },
                            newyear: {
                                id: "newyear",
                                icon: "🎆",
                                name: "Happy New Year!",
                                pill: "🎆 New Year Edition",
                                sub: "ARCHERSTUDIO · 2027 EDITION",
                                accent: "#d97706",
                                accentHover: "#b45309",
                                accentSoft: "#fffbeb",
                                particle: "sparkle",
                                colors: ["#d97706", "#eab308", "#1d4ed8", "#0f172a"],
                                stencils: {
                                    ny_star: ["✨ Starburst", () => `<polygon points="250,40 285,185 435,185 312,275 358,425 250,335 142,425 188,275 65,185 215,185"/>`]
                                }
                            },
                            valentines: {
                                id: "valentines",
                                icon: "💖",
                                name: "Happy Valentine's Day!",
                                pill: "💖 Valentine's Wall",
                                sub: "ARCHERSTUDIO · LOVE NOTES",
                                accent: "#db2777",
                                accentHover: "#be185d",
                                accentSoft: "#fdf2f8",
                                particle: "hearts",
                                colors: ["#db2777", "#e11d48", "#f43f5e", "#f472b6"],
                                stencils: {
                                    val_heart: ["💖 Heart", () => `<path d="M250 430 C70 300 85 120 195 135 C230 140 250 175 250 195 C250 175 270 140 305 135 C415 120 430 300 250 430 Z"/>`]
                                }
                            },
                            halloween: {
                                id: "halloween",
                                icon: "🎃",
                                name: "Spooky Season!",
                                pill: "🎃 Spooky Wall",
                                sub: "ARCHERSTUDIO · HAUNTED WALL",
                                accent: "#7c3aed",
                                accentHover: "#6d28d9",
                                accentSoft: "#f5f3ff",
                                particle: "spooky",
                                colors: ["#7c3aed", "#ea580c", "#0f172a", "#16a34a"],
                                stencils: {
                                    spooky_ghost: ["👻 Ghost", () => `<path d="M140 420 V220 C140 120 360 120 360 220 V420 L315 385 L275 420 L250 390 L225 420 L185 385 Z"/><circle cx="215" cy="220" r="14"/><circle cx="285" cy="220" r="14"/>`]
                                }
                            },
                            philippines: {
                                id: "philippines",
                                icon: "🇵🇭",
                                name: "Mabuhay! Filipino Pride",
                                pill: "🇵🇭 Pinoy Pride",
                                sub: "ARCHERSTUDIO · BAYANIHAN WALL",
                                accent: "#1d4ed8",
                                accentHover: "#1e40af",
                                accentSoft: "#eff6ff",
                                particle: "sparkle",
                                colors: ["#1d4ed8", "#dc2626", "#eab308", "#ffffff"],
                                stencils: {
                                    ph_sun: ["☀️ PH Sun", () => `<circle cx="250" cy="250" r="75"/><path d="M250 60V145M250 355V440M60 250H145M355 250H440M115 115L175 175M325 325L385 385M385 115L325 175M175 325L115 385"/>`]
                                }
                            }
                        };

                        function detectCalendarSeason(now = new Date()) {
                            const m = now.getMonth() + 1;
                            const d = now.getDate();
                            if (m === 12 && d <= 26) return "christmas";
                            if ((m === 12 && d >= 27) || (m === 1 && d <= 5)) return "newyear";
                            if (m === 2 && d <= 16) return "valentines";
                            if ((m === 10 && d >= 20) || (m === 11 && d <= 3)) return "halloween";
                            if ((m === 6 && d <= 15) || m === 8) return "philippines";
                            return "none";
                        }

                        let activeSeason = null;
                        let seasonFxRaf = null;

                        function getResolvedSeason() {
                            const override = lsGet(LS_SEASON_OVERRIDE, "auto");
                            const key = override === "auto" ? detectCalendarSeason() : override;
                            return SEASONS[key] || null;
                        }

                        function setSeasonOverride(val) {
                            lsSet(LS_SEASON_OVERRIDE, val);
                            applySeasonalTheme();
                            showToast(val === "auto" ? "Seasonal theme set to Auto" : "Updated seasonal theme");
                        }

                        function applySeasonEffectsToggle() {
                            const enabled = document.getElementById("opt-season-fx").checked;
                            lsSet(LS_SEASON_FX, enabled);
                            startSeasonalParticles();
                        }

                        function applySeasonalTheme() {
                            const override = lsGet(LS_SEASON_OVERRIDE, "auto");
                            const sel = document.getElementById("season-preview-select");
                            if (sel) sel.value = override;

                            const fxCheck = document.getElementById("opt-season-fx");
                            if (fxCheck) fxCheck.checked = lsGet(LS_SEASON_FX, true) !== false;

                            activeSeason = getResolvedSeason();
                            const root = document.documentElement;
                            const pill = document.getElementById("season-pill");
                            const banner = document.getElementById("season-banner");
                            const monumentSub = document.querySelector(".center-event-sub");
                            const moreIcon = document.getElementById("season-more-icon");
                            const moreLabel = document.getElementById("season-more-label");

                            // Remove old seasonal stencils before injecting new ones
                            Object.keys(STENCILS).forEach(k => {
                                if (k.startsWith("season_")) delete STENCILS[k];
                            });

                            if (!activeSeason) {
                                root.style.setProperty("--accent", "#1d4ed8");
                                root.style.setProperty("--accent-hover", "#1e40af");
                                root.style.setProperty("--accent-soft", "#eff6ff");
                                if (pill) pill.hidden = true;
                                if (banner) banner.hidden = true;
                                if (monumentSub) monumentSub.textContent = "ARCHERSTUDIO";
                                if (moreIcon) moreIcon.textContent = "🗓️";
                                if (moreLabel) moreLabel.textContent = override === "auto" ? "Standard (No active holiday)" : "Default theme";
                            } else {
                                root.style.setProperty("--accent", activeSeason.accent);
                                root.style.setProperty("--accent-hover", activeSeason.accentHover);
                                root.style.setProperty("--accent-soft", activeSeason.accentSoft);
                                if (pill) {
                                    pill.textContent = activeSeason.pill;
                                    pill.hidden = false;
                                }
                                if (banner) {
                                    banner.textContent = `${activeSeason.icon} ${activeSeason.name}`;
                                    banner.hidden = false;
                                }
                                if (monumentSub) monumentSub.textContent = activeSeason.sub;
                                if (moreIcon) moreIcon.textContent = activeSeason.icon;
                                if (moreLabel) moreLabel.textContent = activeSeason.name;

                                // Add seasonal stencils
                                Object.entries(activeSeason.stencils || {}).forEach(([k, val]) => {
                                    STENCILS["season_" + k] = val;
                                });
                            }

                            // Refresh stencil buttons
                            const stencilList = document.getElementById("stencil-list");
                            if (stencilList) {
                                stencilList.innerHTML = "";
                                Object.entries(STENCILS).forEach(([k, [label]]) => {
                                    const b = document.createElement("button");
                                    b.type = "button";
                                    b.className = "chip-btn" + (activeStencil === k ? " active" : "");
                                    b.dataset.k = k;
                                    b.textContent = label;
                                    b.onclick = () => setStencil(k);
                                    stencilList.appendChild(b);
                                });
                            }

                            startSeasonalParticles();
                        }

                        function startSeasonalParticles() {
                            if (seasonFxRaf) {
                                cancelAnimationFrame(seasonFxRaf);
                                seasonFxRaf = null;
                            }
                            const cvs = document.getElementById("seasonal-canvas");
                            if (!cvs) return;
                            const ctx = cvs.getContext("2d");
                            ctx.clearRect(0, 0, cvs.width, cvs.height);

                            const reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
                            const enabled = lsGet(LS_SEASON_FX, true) !== false;
                            if (!activeSeason || !enabled || reduced) return;

                            const resize = () => {
                                cvs.width = window.innerWidth;
                                cvs.height = window.innerHeight;
                            };
                            resize();

                            const mode = activeSeason.particle;
                            const count = 26;
                            const items = Array.from({ length: count }, () => ({
                                x: Math.random() * cvs.width,
                                y: Math.random() * cvs.height,
                                r: 2.5 + Math.random() * 4,
                                vy: 0.45 + Math.random() * 0.95,
                                vx: (Math.random() - 0.5) * 0.5,
                                phase: Math.random() * Math.PI * 2,
                                glyph: mode === "hearts" ? "♥" : mode === "spooky" ? (Math.random() > 0.5 ? "✦" : "🦇") : "✦"
                            }));

                            function tick() {
                                ctx.clearRect(0, 0, cvs.width, cvs.height);
                                // Only render ambient particles on Home or Wall tabs so Draw stays distraction-free
                                if (currentView === "home" || currentView === "wall") {
                                    for (const p of items) {
                                        p.y += p.vy;
                                        p.phase += 0.02;
                                        p.x += p.vx + Math.sin(p.phase) * 0.35;
                                        if (p.y > cvs.height + 12) { p.y = -10; p.x = Math.random() * cvs.width; }
                                        if (p.x > cvs.width + 12) p.x = -10;
                                        if (p.x < -12) p.x = cvs.width + 10;

                                        ctx.save();
                                        ctx.globalAlpha = 0.42;
                                        if (mode === "snow") {
                                            ctx.fillStyle = "#93c5fd";
                                            ctx.beginPath();
                                            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
                                            ctx.fill();
                                        } else {
                                            ctx.fillStyle = activeSeason.accent;
                                            ctx.font = `${Math.round(p.r * 3.2)}px sans-serif`;
                                            ctx.fillText(p.glyph, p.x, p.y);
                                        }
                                        ctx.restore();
                                    }
                                }
                                seasonFxRaf = requestAnimationFrame(tick);
                            }
                            seasonFxRaf = requestAnimationFrame(tick);
                        }
"""

# Apply replacements safely
if "SEASONAL & HOLIDAY ENGINE" in html:
    print("Seasonal patch is already applied!")
    sys.exit(0)

assert "</style>" in html, "Could not find </style>"
html = html.replace("</style>", SEASONAL_CSS + "\n                        </style>", 1)

assert SEASONAL_TOPBAR_TARGET in html, "Could not find topbar target"
html = html.replace(SEASONAL_TOPBAR_TARGET, SEASONAL_TOPBAR_REPLACE, 1)

assert SEASONAL_HOME_TARGET in html, "Could not find home card target"
html = html.replace(SEASONAL_HOME_TARGET, SEASONAL_HOME_REPLACE, 1)

assert SEASONAL_MORE_TARGET in html, "Could not find More tab options target"
html = html.replace(SEASONAL_MORE_TARGET, SEASONAL_MORE_REPLACE, 1)

assert SEASONAL_CANVAS_TARGET in html, "Could not find confetti-canvas target"
html = html.replace(SEASONAL_CANVAS_TARGET, SEASONAL_CANVAS_REPLACE, 1)

INIT_HOOK = "                        initUserProfile();"
assert INIT_HOOK in html, "Could not find initUserProfile() hook"
html = html.replace(INIT_HOOK, SEASONAL_JS + "\n                        initUserProfile();\n                        applySeasonalTheme();", 1)

path.write_text(html, encoding="utf-8")
print(f"Successfully patched '{TARGET_FILE}' with the Seasonal & Holiday Engine!")