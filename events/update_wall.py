import re

with open("freedomwall.html", "r", encoding="utf-8") as f:
    html = f.read()

pattern = r'function getActiveWeatherMode\(\)[\s\S]*?function syncLiveWeather\('
replacement = '''function getActiveWeatherMode() {
                            if (!weatherEnabled) return "clear";
                            return weatherOverride === "auto" ? liveWeatherState.mode : weatherOverride;
                        }

                        function applyWeatherEffectsToggle() {
                            const chk = document.getElementById("opt-weather-fx");
                            weatherEnabled = chk ? chk.checked : true;
                            lsSet(LS_WEATHER_FX, weatherEnabled);
                            const pill = document.getElementById("weather-pill");
                            if (pill) pill.hidden = !weatherEnabled;
                            if (!weatherEnabled) {
                                if (weatherRaf) {
                                    cancelAnimationFrame(weatherRaf);
                                    weatherRaf = null;
                                }
                                const cvs = document.getElementById("weather-canvas");
                                if (cvs) cvs.getContext("2d").clearRect(0, 0, cvs.width, cvs.height);
                            } else {
                                updateWeatherPillUI();
                                startWeatherEngine();
                            }
                            if (typeof startSeasonalParticles === "function") startSeasonalParticles();
                        }

                        function updateWeatherPillUI() {
                            const el = document.getElementById("weather-pill-text");
                            if (!el) return;
                            const mode = getActiveWeatherMode();
                            const icons = { clear: "☀️", cloudy: "☁️", rain: "🌧️", storm: "⛈️" };
                            const names = { clear: "Clear", cloudy: "Cloudy", rain: "Rain", storm: "Storm" };
                            const tag = weatherOverride === "auto" ? `${liveWeatherState.temp}°C ${names[mode]}` : `Preview: ${names[mode]}`;
                            el.textContent = `${icons[mode] || "🌤️"} ${tag}`;
                        }

                        function cycleWeatherPreview() {
                            const nextIdx = (WEATHER_MODES.indexOf(weatherOverride) + 1) % WEATHER_MODES.length;
                            weatherOverride = WEATHER_MODES[nextIdx];
                            rebuildWeatherParticles();
                            updateWeatherPillUI();
                            if (typeof startSeasonalParticles === "function") startSeasonalParticles();
                            haptic(8);
                            const mode = getActiveWeatherMode();
                            showToast(weatherOverride === "auto"
                                ? `Sky synced to live weather (${liveWeatherState.temp}°C ${liveWeatherState.label})`
                                : `Weather effect preview: ${mode.toUpperCase()}`
                            );
                        }

                        function rebuildWeatherParticles() {
                            const cvs = document.getElementById("weather-canvas");
                            if (!cvs) return;
                            cvs.width = window.innerWidth;
                            cvs.height = window.innerHeight;
                            const mode = getActiveWeatherMode();
                            weatherParticles = [];
                            weatherSplashes = [];

                            if (mode === "rain" || mode === "storm") {
                                const count = mode === "storm" ? 130 : 75;
                                for (let i = 0; i < count; i++) {
                                    weatherParticles.push({
                                        x: Math.random() * (cvs.width + 120),
                                        y: Math.random() * cvs.height,
                                        len: (mode === "storm" ? 20 : 14) + Math.random() * 14,
                                        vy: (mode === "storm" ? 13 : 9) + Math.random() * 6,
                                        vx: mode === "storm" ? -3.2 : -1.6,
                                        alpha: 0.35 + Math.random() * 0.35
                                    });
                                }
                            } else if (mode === "cloudy") {
                                for (let i = 0; i < 10; i++) {
                                    weatherParticles.push({
                                        x: Math.random() * cvs.width,
                                        y: 50 + Math.random() * (cvs.height * 0.65),
                                        r: 95 + Math.random() * 115,
                                        vx: 0.25 + Math.random() * 0.35,
                                        alpha: 0.14 + Math.random() * 0.10
                                    });
                                }
                            }
                        }

                        function startWeatherEngine() {
                            if (weatherRaf) cancelAnimationFrame(weatherRaf);
                            const cvs = document.getElementById("weather-canvas");
                            if (!cvs) return;
                            const ctx = cvs.getContext("2d");
                            rebuildWeatherParticles();

                            window.removeEventListener("resize", rebuildWeatherParticles);
                            window.addEventListener("resize", rebuildWeatherParticles);

                            function tick() {
                                if (cvs.width !== window.innerWidth || cvs.height !== window.innerHeight) {
                                    cvs.width = window.innerWidth;
                                    cvs.height = window.innerHeight;
                                }
                                ctx.clearRect(0, 0, cvs.width, cvs.height);

                                const viewAlphaScale = currentView === "draw" ? 0.22 : 1.0;
                                const mode = getActiveWeatherMode();

                                if (mode === "cloudy") {
                                    for (const c of weatherParticles) {
                                        c.x += c.vx;
                                        if (c.x - c.r > cvs.width) c.x = -c.r;
                                        const g = ctx.createRadialGradient(c.x, c.y, c.r * 0.15, c.x, c.y, c.r);
                                        g.addColorStop(0, `rgba(148, 163, 184, ${c.alpha * viewAlphaScale})`);
                                        g.addColorStop(1, "rgba(148, 163, 184, 0)");
                                        ctx.fillStyle = g;
                                        ctx.beginPath();
                                        ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
                                        ctx.fill();
                                    }
                                } else if (mode === "rain" || mode === "storm") {
                                    ctx.fillStyle = `rgba(30, 58, 138, ${(mode === "storm" ? 0.08 : 0.04) * viewAlphaScale})`;
                                    ctx.fillRect(0, 0, cvs.width, cvs.height);

                                    ctx.lineWidth = 1.5;
                                    for (const d of weatherParticles) {
                                        ctx.strokeStyle = `rgba(59, 130, 246, ${d.alpha * viewAlphaScale})`;
                                        ctx.beginPath();
                                        ctx.moveTo(d.x, d.y);
                                        ctx.lineTo(d.x + d.vx * 1.4, d.y + d.len);
                                        ctx.stroke();

                                        d.x += d.vx;
                                        d.y += d.vy;
                                        if (d.y > cvs.height - 62) {
                                            if (Math.random() < 0.25 && weatherSplashes.length < 30) {
                                                weatherSplashes.push({ x: d.x, y: cvs.height - 62, r: 1, maxR: 8 + Math.random() * 6, alpha: 0.45 });
                                            }
                                            d.y = -20;
                                            d.x = Math.random() * (cvs.width + 120);
                                        }
                                        if (d.x < -40) d.x = cvs.width + 40;
                                    }

                                    for (let i = weatherSplashes.length - 1; i >= 0; i--) {
                                        const s = weatherSplashes[i];
                                        s.r += 0.6;
                                        s.alpha -= 0.03;
                                        if (s.alpha <= 0) { weatherSplashes.splice(i, 1); continue; }
                                        ctx.strokeStyle = `rgba(59, 130, 246, ${s.alpha * viewAlphaScale})`;
                                        ctx.lineWidth = 1;
                                        ctx.beginPath();
                                        ctx.ellipse(s.x, s.y, s.r, s.r * 0.35, 0, 0, Math.PI * 2);
                                        ctx.stroke();
                                    }

                                    if (mode === "storm" && Math.random() < 0.005) {
                                        weatherLightning = 0.32;
                                    }
                                    if (weatherLightning > 0) {
                                        ctx.fillStyle = `rgba(224, 242, 254, ${weatherLightning * viewAlphaScale})`;
                                        ctx.fillRect(0, 0, cvs.width, cvs.height);
                                        weatherLightning -= 0.025;
                                    }
                                }

                                weatherRaf = requestAnimationFrame(tick);
                            }
                            weatherRaf = requestAnimationFrame(tick);
                        }

                        async function syncLiveWeather('''

new_html, count = re.subn(pattern, replacement, html, count=1)
assert count == 1, "Weather function block not found"

new_html = new_html.replace(
    "startWeatherEngine();",
    "applyWeatherEffectsToggle();",
    1
)

new_html = new_html.replace(
    "rebuildWeatherParticles();\n                                updateWeatherPillUI();",
    "rebuildWeatherParticles();\n                                updateWeatherPillUI();\n                                if (typeof startSeasonalParticles === \"function\") startSeasonalParticles();"
)

with open("freedomwall.html", "w", encoding="utf-8") as f:
    f.write(new_html)

print("Successfully patched freedomwall.html!")