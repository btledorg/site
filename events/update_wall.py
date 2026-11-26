import re
import sys

filename = sys.argv[1] if len(sys.argv) > 1 else "freedomwall.html"

with open(filename, "r", encoding="utf-8") as f:
    html = f.read()

new_seasons_block = """const SEASONS = {
                            christmas: {
                                id: "christmas",
                                icon: "🎄",
                                name: "Merry Christmas!",
                                pill: "🎄 Holiday Edition",
                                sub: "ARCHERSTUDIO",
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
                                sub: "ARCHERSTUDIO",
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
                                sub: "ARCHERSTUDIO",
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
                                sub: "ARCHERSTUDIO",
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
                                sub: "ARCHERSTUDIO",
                                accent: "#1d4ed8",
                                accentHover: "#1e40af",
                                accentSoft: "#eff6ff",
                                particle: "sparkle",
                                colors: ["#1d4ed8", "#dc2626", "#eab308", "#ffffff"],
                                stencils: {
                                    ph_sun: ["☀️ PH Sun", () => `<circle cx="250" cy="250" r="75"/><path d="M250 60V145M250 355V440M60 250H145M355 250H440M115 115L175 175M325 325L385 385M385 115L325 175M175 325L115 385"/>`]
                                }
                            },
                            lunar_new_year: {
                                id: "lunar_new_year",
                                icon: "🧧",
                                name: "Happy Lunar New Year!",
                                pill: "🧧 Lunar New Year",
                                sub: "ARCHERSTUDIO",
                                accent: "#e11d48",
                                accentHover: "#be123c",
                                accentSoft: "#fff1f2",
                                particle: "sparkle",
                                colors: ["#e11d48", "#eab308", "#f59e0b", "#0f172a"],
                                stencils: {
                                    lny_lantern: ["🏮 Lantern", () => `<rect x="170" y="140" width="160" height="220" rx="70"/><line x1="250" y1="80" x2="250" y2="140"/><line x1="250" y1="360" x2="250" y2="435"/><line x1="220" y1="145" x2="220" y2="355"/><line x1="280" y1="145" x2="280" y2="355"/>`]
                                }
                            },
                            holy_week: {
                                id: "holy_week",
                                icon: "✝️",
                                name: "Blessed Holy Week",
                                pill: "✝️ Holy Week",
                                sub: "ARCHERSTUDIO",
                                accent: "#6d28d9",
                                accentHover: "#5b21b6",
                                accentSoft: "#f5f3ff",
                                particle: "sparkle",
                                colors: ["#6d28d9", "#eab308", "#334155", "#f8fafc"],
                                stencils: {
                                    hw_cross: ["✝️ Cross", () => `<path d="M250 85V415M155 195H345"/>`]
                                }
                            },
                            teachers_day: {
                                id: "teachers_day",
                                icon: "🍎",
                                name: "Happy Teachers' Day!",
                                pill: "🍎 Teachers' Day",
                                sub: "ARCHERSTUDIO",
                                accent: "#15803d",
                                accentHover: "#166534",
                                accentSoft: "#f0fdf4",
                                particle: "sparkle",
                                colors: ["#15803d", "#dc2626", "#1d4ed8", "#eab308"],
                                stencils: {
                                    td_apple: ["🍎 Apple", () => `<path d="M250 175 C175 155 125 220 145 315 C160 385 215 425 250 405 C285 425 340 385 355 315 C375 220 325 155 250 175 Z"/><path d="M250 175 C255 125 295 105 320 115"/>`]
                                }
                            },
                            undas_all_saints: {
                                id: "undas_all_saints",
                                icon: "🕯️",
                                name: "Undas & All Saints",
                                pill: "🕯️ Undas",
                                sub: "ARCHERSTUDIO",
                                accent: "#b45309",
                                accentHover: "#92400e",
                                accentSoft: "#fffbeb",
                                particle: "sparkle",
                                colors: ["#b45309", "#f59e0b", "#334155", "#fef3c7"],
                                stencils: {
                                    undas_candle: ["🕯️ Candle", () => `<rect x="215" y="220" width="70" height="200" rx="8"/><path d="M250 120 C225 155 225 185 250 205 C275 185 275 155 250 120 Z"/>`]
                                }
                            }
                        };"""

new_detect_block = """function getEasterSunday(year) {
                            const a = year % 19;
                            const b = Math.floor(year / 100);
                            const c = year % 100;
                            const d = Math.floor(b / 4);
                            const e = b % 4;
                            const f = Math.floor((b + 8) / 25);
                            const g = Math.floor((b - f + 1) / 3);
                            const h = (19 * a + b - d - g + 15) % 30;
                            const i = Math.floor(c / 4);
                            const k = c % 4;
                            const l = (32 + 2 * e + 2 * i - h - k) % 7;
                            const m = Math.floor((a + 11 * h + 22 * l) / 451);
                            const month = Math.floor((h + l - 7 * m + 114) / 31);
                            const day = ((h + l - 7 * m + 114) % 31) + 1;
                            return new Date(year, month - 1, day);
                        }

                        function detectCalendarSeason(now = new Date()) {
                            const y = now.getFullYear();
                            const m = now.getMonth() + 1;
                            const d = now.getDate();

                            const easter = getEasterSunday(y);
                            const startDay = new Date(y, now.getMonth(), d).getTime();
                            const hwStart = new Date(easter.getFullYear(), easter.getMonth(), easter.getDate() - 3).getTime();
                            const hwEnd = new Date(easter.getFullYear(), easter.getMonth(), easter.getDate() + 1).getTime();
                            if (startDay >= hwStart && startDay <= hwEnd) return "holy_week";

                            if ((m === 12 && d >= 27) || (m === 1 && d <= 5)) return "newyear";
                            if ((m === 11 && d >= 4) || (m === 12 && d <= 26)) return "christmas";
                            if (m === 10 && d === 5) return "teachers_day";
                            if ((m === 10 && d >= 30) || (m === 11 && d <= 2)) return "undas_all_saints";
                            if ((m === 10 && d >= 20) || (m === 11 && d <= 3)) return "halloween";
                            if (m === 2 && d <= 16) return "valentines";
                            if ((m === 1 && d >= 20) || (m === 2 && d <= 10)) return "lunar_new_year";
                            if ((m === 6 && d <= 15) || m === 8) return "philippines";
                            return "none";
                        }"""

# Replace entire const SEASONS = { ... }; block up to its matching `};`
seasons_re = re.compile(
    r"const SEASONS\s*=\s*\{[\s\S]*?\n\s*\n\s*\};",
    re.MULTILINE
)
if seasons_re.search(html):
    html = seasons_re.sub(new_seasons_block, html, count=1)
    print("Replaced SEASONS block.")
else:
    # Fallback match up to first `};` after `const SEASONS`
    seasons_fallback = re.compile(r"const SEASONS\s*=\s*\{[\s\S]*?\};", re.MULTILINE)
    html, count = seasons_fallback.subn(new_seasons_block, html, count=1)
    print("Replaced SEASONS block (fallback):" if count else "FAILED to find SEASONS block.")

# Replace detectCalendarSeason (and any prior getEasterSunday)
detect_re = re.compile(
    r"(?:function getEasterSunday\(year\)\s*\{[\s\S]*?\n\s*\}\s*)?function detectCalendarSeason\(now = new Date\(\)\)\s*\{[\s\S]*?\n\s*\}",
    re.MULTILINE
)
html, d_count = detect_re.subn(new_detect_block, html, count=1)
print("Replaced detectCalendarSeason:" if d_count else "FAILED to find detectCalendarSeason.")

# Ensure dropdown options exist
if 'value="lunar_new_year"' not in html:
    opt_re = re.compile(r'(<option value="philippines">.*?</option>)')
    extra_opts = (
        r'\1\n'
        r'                                        <option value="lunar_new_year">🧧 Lunar New Year</option>\n'
        r'                                        <option value="holy_week">✝️ Holy Week</option>\n'
        r'                                        <option value="teachers_day">🍎 Teachers\' Day</option>\n'
        r'                                        <option value="undas_all_saints">🕯️ Undas / All Saints\'</option>'
    )
    html, o_count = opt_re.subn(extra_opts, html, count=1)
    print("Added select options:" if o_count else "Could not find philippines <option>.")

with open(filename, "w", encoding="utf-8") as f:
    f.write(html)