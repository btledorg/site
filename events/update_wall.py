import sys
from pathlib import Path

def patch_html(file_path: str):
    path = Path(file_path)
    if not path.exists():
        print(f"Error: File '{file_path}' not found.")
        sys.exit(1)

    content = path.read_text(encoding="utf-8")

    # 1. Fix duplicate stencils in initUpgradeControls() by clearing stencilList first
    old_stencil_block = """                            const stencilList = document.getElementById("stencil-list");
                            Object.entries(STENCILS).forEach(([k, [label]]) => {"""

    new_stencil_block = """                            const stencilList = document.getElementById("stencil-list");
                            stencilList.innerHTML = "";
                            Object.entries(STENCILS).forEach(([k, [label]]) => {"""

    assert old_stencil_block in content, "Could not find stencilList block in initUpgradeControls()"
    content = content.replace(old_stencil_block, new_stencil_block, 1)

    # 2. Add Weather effects toggle switch in More -> Options
    old_options_card = """                                <label class="list-row">
                                    <span>Wall tile borders</span>
                                    <span class="switch"><input type="checkbox" id="opt-borders" onchange="applyOptions()"></span>
                                </label>"""

    new_options_card = """                                <label class="list-row">
                                    <span>Wall tile borders</span>
                                    <span class="switch"><input type="checkbox" id="opt-borders" onchange="applyOptions()"></span>
                                </label>
                                <label class="list-row">
                                    <span>Weather effects</span>
                                    <span class="switch"><input type="checkbox" id="opt-weather-fx" checked onchange="applyWeatherEffectsToggle()"></span>
                                </label>"""

    assert old_options_card in content, "Could not find Options card block"
    content = content.replace(old_options_card, new_options_card, 1)

    # 3. Add weather toggle state, persistence, and guard inside weather engine
    old_weather_decl = """                        const WEATHER_MODES = ["auto", "clear", "cloudy", "rain", "storm"];
                        let weatherOverride = "auto";"""

    new_weather_decl = """                        const LS_WEATHER_FX = "fw_weather_fx_v1";
                        const WEATHER_MODES = ["auto", "clear", "cloudy", "rain", "storm"];
                        let weatherOverride = "auto";
                        let weatherEnabled = lsGet(LS_WEATHER_FX, true) !== false;"""

    assert old_weather_decl in content, "Could not find WEATHER_MODES declaration"
    content = content.replace(old_weather_decl, new_weather_decl, 1)

    old_weather_fn = """                        function getActiveWeatherMode() {
                            return weatherOverride === "auto" ? liveWeatherState.mode : weatherOverride;
                        }"""

    new_weather_fn = """                        function getActiveWeatherMode() {
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
                        }"""

    assert old_weather_fn in content, "Could not find getActiveWeatherMode()"
    content = content.replace(old_weather_fn, new_weather_fn, 1)

    # 4. Initialize weather toggle checkbox & pill visibility on startup
    old_weather_boot = """                        startWeatherEngine();"""

    new_weather_boot = """                        const weatherChk = document.getElementById("opt-weather-fx");
                        if (weatherChk) weatherChk.checked = weatherEnabled;
                        const weatherPill = document.getElementById("weather-pill");
                        if (weatherPill) weatherPill.hidden = !weatherEnabled;
                        if (weatherEnabled) startWeatherEngine();"""

    assert old_weather_boot in content, "Could not find startWeatherEngine() boot call"
    content = content.replace(old_weather_boot, new_weather_boot, 1)

    path.write_text(content, encoding="utf-8")
    print(f"Successfully updated {file_path}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python update_artcher.py <path_to_html>")
        sys.exit(1)
    patch_html(sys.argv[1])