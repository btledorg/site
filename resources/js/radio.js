/* Radio Mode, playback, native bridge, and diagnostics. */
const appDiagnostics = [];
const APP_DIAGNOSTICS_LIMIT = 100;

function formatDiagnosticValue(value) {
    if (value instanceof Error) return value.stack || `${value.name}: ${value.message}`;
    if (typeof value === "string") return value;
    try {
        return JSON.stringify(value);
    } catch (error) {
        return String(value);
    }
}

function renderAppDiagnostics() {
    const output = document.getElementById("app-diagnostics-log");
    if (!output) return;
    output.textContent = appDiagnostics.length
    ? appDiagnostics.join("\n")
    : "No diagnostics recorded yet.";
    output.scrollTop = output.scrollHeight;
}

function logAppDiagnostic(level, ...values) {
    const message = values.map(formatDiagnosticValue).join(" ")
    .replace(/https?:\/\/[^\s"'<>]+/g, value => {
        try {
            const url = new URL(value);
            return `${url.origin}${url.pathname}${url.search ? "?[query]" : ""}`;
        } catch (error) {
            return value;
        }
    })
    .slice(0, 1800);
    appDiagnostics.push(`[${new Date().toLocaleTimeString()}] ${String(level).toUpperCase()}: ${message}`);
    if (appDiagnostics.length > APP_DIAGNOSTICS_LIMIT) appDiagnostics.shift();
    renderAppDiagnostics();
}

["log", "info", "debug", "warn", "error"].forEach(level => {
    if (typeof console[level] !== "function") return;
    const original = console[level].bind(console);
    console[level] = (...values) => {
        original(...values);
        logAppDiagnostic(level, ...values);
    };
});

window.addEventListener("error", event => {
    logAppDiagnostic("error", event.message || "Uncaught application error", event.filename, event.lineno);
});
window.addEventListener("unhandledrejection", event => {
    logAppDiagnostic("error", "Unhandled promise rejection", event.reason);
});

function clearAppDiagnostics() {
    appDiagnostics.length = 0;
    renderAppDiagnostics();
}

function toggleAppDiagnostics() {
    const output = document.getElementById("app-diagnostics-log");
    const toggle = document.getElementById("app-diagnostics-toggle");
    if (!output || !toggle) return;
    const isExpanded = toggle.getAttribute("aria-expanded") === "true";
    output.hidden = isExpanded;
    toggle.setAttribute("aria-expanded", String(!isExpanded));
    toggle.textContent = isExpanded ? "Show logs" : "Hide logs";
}

function copyAppDiagnostics() {
    const text = appDiagnostics.join("\n") || "No diagnostics recorded yet.";
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(
            () => showToast("Diagnostics copied"),
            error => {
                logAppDiagnostic("error", "Unable to copy diagnostics", error);
                showToast("Could not copy diagnostics");
            }
        );
        return;
    }
    
    const input = document.createElement("textarea");
    input.value = text;
    input.style.position = "fixed";
    input.style.opacity = "0";
    document.body.appendChild(input);
    input.select();
    const copied = document.execCommand("copy");
    input.remove();
    if (copied) showToast("Diagnostics copied");
    else {
        logAppDiagnostic("warn", "Clipboard copy is unavailable in this browser");
        showToast("Could not copy diagnostics");
    }
}


// LIVE STREAMING RADIO API (Radio Browser API + Synth Fallback)
// =========================================================================
const RADIO_API_ENDPOINTS = [
    "https://de1.api.radio-browser.info/json/stations/search",
    "https://nl1.api.radio-browser.info/json/stations/search",
    "https://at1.api.radio-browser.info/json/stations/search"
];

/* FAVORITE RADIOS & DEAD STREAM PRUNING */
const LS_MUSIC_VOL = "fw_music_vol_v1";
const LS_FAV_RADIOS = "fw_fav_radios_v1";
const LS_RADIO_SETTINGS = "fw_radio_settings_v1";
const LS_RADIO_CACHE = "fw_radio_cache_v1";

const RADIO_FILTERS = ["all", "filipino", "english", "lofi", "favorites"];

function normalizeRadioUrl(value) {
    if (typeof value !== "string") return "";
    try {
        const url = new URL(value);
        return url.protocol === "https:" && !url.username && !url.password ? url.href : "";
    } catch (e) {
        return "";
    }
}

function normalizeRadioStation(item) {
    if (!item || typeof item !== "object") return null;
    const url = normalizeRadioUrl(item.url);
    if (!url) return null;
    return {
        name: String(item.name || "Radio station").trim().slice(0, 100),
        url,
        country: String(item.country || "").trim().slice(0, 48),
        category: ["filipino", "english", "lofi"].includes(item.category) ? item.category : "all",
        language: String(item.language || "").trim().slice(0, 80)
    };
}

function loadFavoriteRadios() {
    const saved = lsGet(LS_FAV_RADIOS, []);
    if (!Array.isArray(saved)) return [];
    const seen = new Set();
    return saved.reduce((stations, item) => {
        const station = normalizeRadioStation(item);
        if (!station || seen.has(station.url)) return stations;
        seen.add(station.url);
        stations.push(station);
        return stations;
    }, []);
}

function loadRadioDirectoryCache() {
    const saved = lsGet(LS_RADIO_CACHE, null);
    if (!saved || typeof saved !== "object" || !Array.isArray(saved.stations)) return [];
    const savedAt = Number(saved.savedAt);
    if (!Number.isFinite(savedAt) || savedAt <= 0 || Date.now() - savedAt > 30 * 24 * 60 * 60 * 1000) return [];
    const seen = new Set();
    return saved.stations.reduce((stations, item) => {
        const station = normalizeRadioStation(item);
        if (!station || seen.has(station.url)) return stations;
        seen.add(station.url);
        stations.push(station);
        return stations;
    }, []);
}

function loadRadioSettings() {
    const saved = lsGet(LS_RADIO_SETTINGS, {});
    return saved && typeof saved === "object" && !Array.isArray(saved) ? saved : {};
}

function persistRadioSettings() {
    lsSet(LS_RADIO_SETTINGS, {
        filter: radioStationFilter,
        selectedUrl: selectedRadioUrl,
        autoDJ: radioAutoDJ
    });
}

function persistRadioDirectory() {
    lsSet(LS_RADIO_CACHE, {
        savedAt: Date.now(),
        stations: radioStations.slice(0, 120)
    });
}

let audioCtx = null;
let radioAudio = null;
let favoriteRadios = [];
let deadRadioUrls = new Set();
let radioStationFilter = "all";
let selectedRadioUrl = "";
let radioStations = [];
let currentStationIdx = 0;
let radioDirectoryLoaded = false;
let radioDirectoryPromise = null;
let radioAutoDJ = false;
let radioAutoDJTimer = null;
let radioSleepTimer = null;
let radioIsPaused = false;
let musicPlaying = false;
let musicVolume = 0.4;
let usingSynthFallback = false;
let musicTimer = null;
let chordStep = 0;
let radioModuleInitialized = false;

function initializeRadioModule() {
    if (radioModuleInitialized) return;
    const storedRadioSettings = loadRadioSettings();
    radioStationFilter = RADIO_FILTERS.includes(storedRadioSettings.filter) ? storedRadioSettings.filter : "all";
    selectedRadioUrl = normalizeRadioUrl(storedRadioSettings.selectedUrl);
    favoriteRadios = loadFavoriteRadios();
    radioStations = Array.from(new Map(loadRadioDirectoryCache().concat(favoriteRadios).map(station => [station.url, station])).values());
    currentStationIdx = Math.max(0, radioStations.findIndex(station => station.url === selectedRadioUrl));
    radioAutoDJ = storedRadioSettings.autoDJ === true;
    const storedVolumeValue = lsGet(LS_MUSIC_VOL, 0.4);
    const storedVolume = (typeof storedVolumeValue === "number" || (typeof storedVolumeValue === "string" && storedVolumeValue.trim())) ? Number(storedVolumeValue) : NaN;
    musicVolume = Number.isFinite(storedVolume) ? Math.max(0, Math.min(1, storedVolume > 1 ? storedVolume / 100 : storedVolume)) : 0.4;
    radioModuleInitialized = true;
}

function isStationFavorite(url) {
    return favoriteRadios.some(f => f.url === url);
}


function toggleFavoriteRadio(station, e) {
    if (e) e.stopPropagation();
    if (!station || !station.url) return;
    const exists = isStationFavorite(station.url);
    if (exists) {
        favoriteRadios = favoriteRadios.filter(f => f.url !== station.url);
        showToast(`Removed from favorites: ${station.name}`);
    } else {
        favoriteRadios = [{
            name: station.name,
            url: station.url,
            country: station.country || "",
            category: station.category || "all",
            language: station.language || ""
        }].concat(favoriteRadios);
        showToast(`★ Saved favorite: ${station.name}`);
    }
    lsSet(LS_FAV_RADIOS, favoriteRadios);
    sortStationsWithFavorites();
    renderRadioStationList();
}

function sortStationsWithFavorites() {
    const activeUrl = radioStations[currentStationIdx]?.url;
    const favUrls = new Set(favoriteRadios.map(f => f.url));
    radioStations.sort((a, b) => Number(favUrls.has(b.url)) - Number(favUrls.has(a.url)));
    if (activeUrl) {
        const newIdx = radioStations.findIndex(s => s.url === activeUrl);
        if (newIdx !== -1) currentStationIdx = newIdx;
    }
}

function pruneBrokenStation(station) {
    if (!station || !station.url) {
        logAppDiagnostic("warn", "Skipped pruning broken radio station", {
            reason: "missing station or station URL"
        });
        return;
    }
    if (radioStations.length <= 20) {
        logAppDiagnostic("warn", "Skipped pruning broken radio station", {
            reason: "station list must remain at least 20 entries",
            station: station.name || "",
            count: radioStations.length
        });
        return;
    }
    deadRadioUrls.add(station.url);
    radioStations = radioStations.filter(s => s.url !== station.url);
    if (currentStationIdx >= radioStations.length) currentStationIdx = 0;
    selectedRadioUrl = radioStations[currentStationIdx]?.url || "";
    persistRadioDirectory();
    renderRadioStationList();
    persistRadioSettings();
}
const LOFI_CHORDS = [
    [261.63, 329.63, 392.00, 493.88],
    [220.00, 261.63, 329.63, 392.00],
    [293.66, 349.23, 440.00, 523.25],
    [196.00, 246.94, 293.66, 349.23]
];

function playChord(freqs) {
    if (!audioCtx || !musicPlaying) return;
    const now = audioCtx.currentTime;
    freqs.forEach((freq, idx) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        const filter = audioCtx.createBiquadFilter();
        osc.type = idx === 0 ? "sine" : "triangle";
        osc.frequency.setValueAtTime(freq, now + idx * 0.04);
        filter.type = "lowpass";
        filter.frequency.setValueAtTime(680, now);
        gain.gain.setValueAtTime(0.0001, now + idx * 0.04);
        gain.gain.exponentialRampToValueAtTime(Math.max(0.001, 0.025 * musicVolume), now + idx * 0.04 + 0.35);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 2.5);
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now + idx * 0.04);
        osc.stop(now + 2.6);
    });
}

function startSynthFallback(reason = "Offline chill synth ♪") {
    usingSynthFallback = true;
    if (radioAudio) {
        radioAudio.pause();
        radioAudio.removeAttribute("src");
    }
    if (!audioCtx) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AudioContext();
    }
    if (audioCtx.state === "suspended") audioCtx.resume();
    clearInterval(musicTimer);
    playChord(LOFI_CHORDS[chordStep % LOFI_CHORDS.length]);
    chordStep++;
    musicTimer = setInterval(() => {
        playChord(LOFI_CHORDS[chordStep % LOFI_CHORDS.length]);
        chordStep++;
    }, 2600);
    updateMuteIcon(reason);
}

function stopSynthFallback() {
    usingSynthFallback = false;
    clearInterval(musicTimer);
    musicTimer = null;
}

const RADIO_FEATURED_NAMES = {
    filipino: ["love radio", "barangay ls", "yes fm", "wish 107.5", "dzmm", "dzbb"],
    english: ["magic 89.9", "easy rock", "jam 88.3", "rj 100", "bbc radio", "capital fm"],
    lofi: ["lofi girl", "chillhop", "box lofi", "lofi radio"]
};

const RADIO_ENGLISH_COUNTRIES = new Set(["US", "GB", "CA", "AU", "NZ", "IE"]);

function stationHasLanguage(station, category) {
    const values = [station.language, station.languagecodes]
    .filter(Boolean)
    .join(",")
    .toLowerCase()
    .split(/[,;|/]+/)
    .map(value => value.trim())
    .filter(Boolean);
    const country = String(station.countrycode || station.country || "").toUpperCase();
    if (category === "filipino") {
        return country === "PH" || values.some(value => ["filipino", "fil", "tagalog", "tgl", "tl"].includes(value));
    }
    if (category === "english") {
        if (values.some(value => value === "english" || value === "eng" || value === "en" || value.includes("english"))) return true;
        return values.length === 0 && RADIO_ENGLISH_COUNTRIES.has(country);
    }
    return true;
}

function stationMatchesRadioFilter(station, filter) {
    if (filter === "all") return true;
    if (filter === "favorites") return isStationFavorite(station.url);
    if (station.category === filter) return true;
    return filter === "filipino" || filter === "english"
    ? stationHasLanguage(station, filter)
    : false;
}

async function fetchRadioStations(force = false) {
    if (radioDirectoryLoaded && !force) return radioStations;
    if (radioDirectoryPromise) return radioDirectoryPromise;
    
    radioDirectoryLoaded = false;
    radioDirectoryPromise = (async function () {
        const perCategory = 24;
        const common = {
            limit: "100",
            order: "clickcount",
            reverse: "true",
            hidebroken: "true",
            is_https: "true"
        };
        const categories = [
            { id: "filipino", label: "Filipino", query: { ...common, countrycode: "PH" } },
            { id: "filipino", label: "Filipino", query: { ...common, language: "filipino" } },
            { id: "filipino", label: "Filipino", query: { ...common, language: "tagalog" } },
            { id: "english", label: "English", query: { ...common, language: "english" } },
            { id: "english", label: "English", query: { ...common, countrycode: "US" } },
            { id: "english", label: "English", query: { ...common, countrycode: "GB" } },
            { id: "english", label: "English", query: { ...common, countrycode: "CA" } },
            { id: "english", label: "English", query: { ...common, countrycode: "AU" } },
            { id: "english", label: "English", query: { ...common, countrycode: "NZ" } },
            { id: "english", label: "English", query: { ...common, countrycode: "IE" } },
            { id: "lofi", label: "Lo-Fi", query: { ...common, tag: "lofi" } }
        ];
        
        function rank(list, category) {
            const featured = RADIO_FEATURED_NAMES[category.id] || [];
            const seenNames = new Set();
            return list
            .filter(station => station && typeof station.name === "string" &&
                station.name.trim() && normalizeRadioUrl(station.url_resolved))
                .filter(station => !station.url_resolved.toLowerCase().endsWith(".m3u8"))
                .filter(station => stationHasLanguage(station, category.id))
                .filter(station => {
                    const key = station.name.toLowerCase().replace(/[^a-z0-9]/g, "");
                    if (!key || seenNames.has(key)) return false;
                    seenNames.add(key);
                    return true;
                })
                .map(station => {
                    const name = station.name.trim();
                    const isFeatured = featured.some(item => name.toLowerCase().includes(item));
                    const score = (isFeatured ? 1000000 : 0) +
                    (Number(station.clickcount) || 0) +
                    (Number(station.votes) || 0) * 5 +
                    (Number(station.clicktrend) || 0) * 2 +
                    (Number(station.bitrate) >= 96 ? 50 : 0);
                    return { station, score };
                })
                .sort((a, b) => b.score - a.score)
                .slice(0, perCategory)
                .map(({ station }) => ({
                    name: station.name.trim().slice(0, 100),
                    url: normalizeRadioUrl(station.url_resolved),
                    country: String(station.countrycode || "").trim().slice(0, 48),
                    category: category.id,
                    language: String(station.language || station.languagecodes || "").trim().slice(0, 80)
                }));
            }
            
            async function queryCategory(category) {
                const params = new URLSearchParams(category.query);
                for (const base of RADIO_API_ENDPOINTS) {
                    const controller = new AbortController();
                    const timeout = setTimeout(() => controller.abort(), 5000);
                    try {
                        const response = await fetch(`${base}?${params.toString()}`, { signal: controller.signal });
                        clearTimeout(timeout);
                        if (!response.ok) {
                            logAppDiagnostic("warn", "Radio directory HTTP response", base, response.status);
                            continue;
                        }
                        const data = await response.json();
                        const stations = rank(Array.isArray(data) ? data : [], category);
                        if (stations.length) return stations;
                    } catch (e) {
                        clearTimeout(timeout);
                        logAppDiagnostic("warn", "Radio directory request failed", base, e);
                    }
                }
                logAppDiagnostic("warn", "No stations discovered for category", category.label);
                return [];
            }
            
            const buckets = await Promise.all(categories.map(queryCategory));
            const seenUrls = new Set();
            const discovered = [];
            const maxLength = Math.max(0, ...buckets.map(bucket => bucket.length));
            for (let i = 0; i < maxLength; i++) {
                for (const bucket of buckets) {
                    const station = bucket[i];
                    if (station && !seenUrls.has(station.url)) {
                        seenUrls.add(station.url);
                        discovered.push(station);
                    }
                }
            }
            
            const combinedByUrl = new Map();
            for (const station of radioStations) {
                if (!deadRadioUrls.has(station.url)) combinedByUrl.set(station.url, { ...station });
            }
            for (const station of favoriteRadios) {
                if (!deadRadioUrls.has(station.url)) combinedByUrl.set(station.url, { ...station });
            }
            for (const station of discovered) {
                if (deadRadioUrls.has(station.url)) continue;
                const saved = combinedByUrl.get(station.url);
                combinedByUrl.set(station.url, saved
                    ? { ...station, ...saved, category: station.category, language: station.language }
                    : station);
                }
                
                const activeUrl = radioStations[currentStationIdx]?.url || selectedRadioUrl;
                radioStations = Array.from(combinedByUrl.values());
                const preferredIndex = radioStations.findIndex(station => station.url === selectedRadioUrl);
                const activeIndex = radioStations.findIndex(station => station.url === activeUrl);
                currentStationIdx = preferredIndex >= 0 ? preferredIndex : Math.max(0, activeIndex);
                selectedRadioUrl = radioStations[currentStationIdx]?.url || "";
                sortStationsWithFavorites();
                radioDirectoryLoaded = true;
                persistRadioDirectory();
                persistRadioSettings();
                renderRadioStationList();
                updateRadioModeUI();
                pushRadioStateToNative();
                return radioStations;
            })();
            
            try {
                return await radioDirectoryPromise;
            } finally {
                radioDirectoryPromise = null;
            }
        }
        
        function setRadioStationFilter(filter) {
            if (!RADIO_FILTERS.includes(filter)) return;
            radioStationFilter = filter;
            persistRadioSettings();
            renderRadioStationList();
        }
        
        function renderRadioStationFilters() {
            document.querySelectorAll("[data-radio-filter]").forEach(button => {
                const selected = button.dataset.radioFilter === radioStationFilter;
                button.classList.toggle("active", selected);
                button.setAttribute("aria-pressed", String(selected));
            });
        }
        
        function renderRadioStationList() {
            const list = document.getElementById("radio-station-list");
            if (!list) return;
            list.replaceChildren();
            renderRadioStationFilters();
            
            const search = (document.getElementById("radio-search-input")?.value || "").trim().toLowerCase();
            const visibleStations = radioStations.filter(station => {
                const matchesFilter = stationMatchesRadioFilter(station, radioStationFilter);
                const searchable = `${station.name} ${station.country} ${station.language}`.toLowerCase();
                return matchesFilter && (!search || searchable.includes(search));
            });
            
            if (visibleStations.length === 0) {
                const empty = document.createElement("p");
                empty.className = "radio-empty-state";
                empty.textContent = radioStationFilter === "favorites" && !search
                ? "No favorites yet. Tap the star on a station to save it."
                : radioDirectoryLoaded
                ? "No stations match this filter."
                : "Loading stations…";
                list.appendChild(empty);
                return;
            }
            
            const activeUrl = radioStations[currentStationIdx]?.url;
            visibleStations.forEach(station => {
                const realIndex = radioStations.findIndex(item => item.url === station.url);
                const isFav = isStationFavorite(station.url);
                const option = document.createElement("div");
                option.className = "radio-station-option" + (station.url === activeUrl ? " active" : "");
                option.setAttribute("role", "listitem");
                
                const select = document.createElement("button");
                select.type = "button";
                select.className = "radio-station-select";
                select.setAttribute("aria-pressed", String(station.url === activeUrl));
                select.addEventListener("click", () => selectRadioStation(realIndex));
                
                const details = document.createElement("span");
                details.className = "radio-station-details";
                const name = document.createElement("strong");
                name.textContent = station.name;
                details.appendChild(name);
                const metadata = document.createElement("small");
                const category = station.category === "filipino" ? "Filipino" :
                station.category === "english" ? "English" :
                station.category === "lofi" ? "Lo-Fi · Worldwide" : "Saved station";
                metadata.textContent = [category, station.country].filter(Boolean).join(" · ");
                details.appendChild(metadata);
                select.appendChild(details);
                option.appendChild(select);
                
                const star = document.createElement("button");
                star.type = "button";
                star.className = "radio-fav-btn" + (isFav ? " is-fav" : "");
                star.textContent = isFav ? "★" : "☆";
                star.title = isFav ? "Remove from favorites" : "Add to favorites";
                star.setAttribute("aria-label", star.title);
                star.addEventListener("click", (e) => toggleFavoriteRadio(station, e));
                option.appendChild(star);
                list.appendChild(option);
            });
        }
        
        function selectRadioStation(index) {
            if (!Number.isInteger(index) || index < 0 || index >= radioStations.length) return;
            currentStationIdx = index;
            radioIsPaused = false;
            selectedRadioUrl = radioStations[index].url;
            persistRadioSettings();
            renderRadioStationList();
            if (!musicPlaying) {
                musicPlaying = true;
                syncRadioAutoDJTimer();
                const slider = document.getElementById("music-volume-slider");
                const value = document.getElementById("music-volume-val");
                if (slider) slider.value = Math.round(musicVolume * 100);
                if (value) value.textContent = Math.round(musicVolume * 100) + "%";
            }
            updateMuteIcon(`Connecting: ${radioStations[index].name}...`);
            playCurrentStation(0);
        }
        
        async function playCurrentStation(attempt = 0) {
            if (!musicPlaying) return;
            let stations;
            if (radioDirectoryLoaded) {
                stations = radioStations;
            } else if (radioStations.length) {
                stations = radioStations;
                fetchRadioStations().catch(error => console.error("Unable to refresh radio stations.", error));
            } else {
                stations = await fetchRadioStations();
            }
            if (!musicPlaying) return;
            
            if (stations.length === 0 || attempt >= Math.min(4, stations.length)) {
                logAppDiagnostic("error", "No playable stations remain", { count: stations.length, attempt });
                startSynthFallback("Offline chill synth ♪");
                return;
            }
            
            stopSynthFallback();
            const station = stations[currentStationIdx % stations.length];
            updateMuteIcon(`Connecting: ${station.name}...`);
            logAppDiagnostic("info", "Connecting to radio station", station.name, new URL(station.url).host, `attempt ${attempt + 1}`);
            
            if (!radioAudio) {
                radioAudio = new Audio();
                radioAudio.preload = "none";
            }
            
            radioAudio.volume = musicVolume;
            radioAudio.src = station.url;
            
            let settled = false;
            const failTimeout = setTimeout(() => {
                if (settled || !musicPlaying) return;
                settled = true;
                logAppDiagnostic("error", "Radio stream timed out", station.name, new URL(station.url).host);
                pruneBrokenStation(station);
                playCurrentStation(attempt + 1);
            }, 7000);
            
            radioAudio.onplaying = () => {
                clearTimeout(failTimeout);
                settled = true;
                if (!musicPlaying) return;
                logAppDiagnostic("info", "Radio stream is playing", station.name);
                const tag = station.country ? ` (${station.country})` : "";
                updateMuteIcon(`Live: ${station.name}${tag}`);
            };
            
            radioAudio.onwaiting = () => {
                logAppDiagnostic("warn", "Radio stream is buffering", station.name);
            };
            radioAudio.onstalled = () => {
                logAppDiagnostic("warn", "Radio stream stalled", station.name);
            };
            
            radioAudio.onerror = () => {
                clearTimeout(failTimeout);
                if (settled || !musicPlaying) return;
                settled = true;
                logAppDiagnostic("error", "Radio media error", station.name, radioAudio.error
                    ? { code: radioAudio.error.code, message: radioAudio.error.message }
                    : "No MediaError details");
                    pruneBrokenStation(station);
                    playCurrentStation(attempt + 1);
                };
                
                try {
                    await radioAudio.play();
                } catch (err) {
                    clearTimeout(failTimeout);
                    logAppDiagnostic("error", "audio.play() rejected", err);
                    if (!settled && musicPlaying) {
                        settled = true;
                        if (err && err.name === "NotAllowedError") {
                            musicPlaying = false;
                            clearInterval(radioAutoDJTimer);
                            radioAutoDJTimer = null;
                            updateMuteIcon("Tap Play to allow radio audio");
                            return;
                        }
                        pruneBrokenStation(station);
                        playCurrentStation(attempt + 1);
                    }
                }
            }
            
            function setMusicVolume(val) {
                const parsed = Number(val);
                musicVolume = Number.isFinite(parsed) ? Math.max(0, Math.min(1, parsed / 100)) : 0.4;
                lsSet(LS_MUSIC_VOL, musicVolume);
                const label = document.getElementById("music-volume-val");
                if (label) label.textContent = Math.round(musicVolume * 100) + "%";
                if (radioAudio) radioAudio.volume = musicVolume;
            }
            
            function syncRadioAutoDJTimer() {
                clearInterval(radioAutoDJTimer);
                radioAutoDJTimer = null;
                if (!radioAutoDJ || !musicPlaying || radioIsPaused) return;
                radioAutoDJTimer = setInterval(() => {
                    if (musicPlaying && radioStations.length > 1) {
                        const randomIndex = Math.floor(Math.random() * radioStations.length);
                        currentStationIdx = randomIndex === currentStationIdx
                        ? (randomIndex + 1) % radioStations.length
                        : randomIndex;
                        selectRadioStation(currentStationIdx);
                    }
                }, 12 * 60 * 1000);
            }
            
            function nextRadioStation() {
                if (!radioStations.length) {
                    if (!musicPlaying) toggleMusic();
                    return;
                }
                currentStationIdx = (currentStationIdx + 1) % radioStations.length;
                selectRadioStation(currentStationIdx);
                showToast(`📻 ${radioStations[currentStationIdx].name}`);
            }
            
            function prevRadioStation() {
                if (!radioStations.length) {
                    if (!musicPlaying) toggleMusic();
                    return;
                }
                currentStationIdx = (currentStationIdx - 1 + radioStations.length) % radioStations.length;
                selectRadioStation(currentStationIdx);
                showToast(`📻 ${radioStations[currentStationIdx].name}`);
            }
            
            function toggleRadioAutoDJ() {
                radioAutoDJ = !radioAutoDJ;
                persistRadioSettings();
                const btn = document.getElementById("radio-mode-autodj-btn");
                if (btn) {
                    btn.textContent = radioAutoDJ ? "Auto-DJ on" : "Auto-DJ off";
                    btn.classList.toggle("btn-accent", radioAutoDJ);
                    btn.setAttribute("aria-pressed", String(radioAutoDJ));
                }
                if (radioAutoDJ) {
                    if (!musicPlaying || radioIsPaused) toggleMusic();
                    syncRadioAutoDJTimer();
                    showToast("Auto-DJ enabled (rotates every 12m)");
                } else {
                    syncRadioAutoDJTimer();
                    showToast("Auto-DJ turned off");
                }
            }
            
            function setRadioSleepTimer(minsStr) {
                const parsed = Number(minsStr);
                const mins = Number.isFinite(parsed) ? Math.max(0, Math.min(240, parsed)) : 0;
                clearTimeout(radioSleepTimer);
                radioSleepTimer = null;
                if (mins <= 0) {
                    showToast("Sleep timer off");
                    return;
                }
                if (!musicPlaying) toggleMusic();
                radioSleepTimer = setTimeout(() => {
                    if (musicPlaying) toggleMusic();
                    const sel = document.getElementById("radio-sleep-select");
                    if (sel) sel.value = "0";
                    radioSleepTimer = null;
                    showToast("Sleep timer finished · Radio stopped");
                }, mins * 60 * 1000);
                showToast(`Radio will stop in ${mins} min`);
            }
            
            function updateRadioModeUI(status = "") {
                const station = radioStations[currentStationIdx];
                const title = document.getElementById("radio-mode-title");
                const state = document.getElementById("radio-mode-state");
                const meta = document.getElementById("radio-mode-meta");
                const playButton = document.getElementById("radio-mode-play-btn");
                const playLabel = document.getElementById("radio-mode-play-label");
                const autoDJButton = document.getElementById("radio-mode-autodj-btn");
                const toolButton = document.getElementById("radio-tool-btn");
                const wallButton = document.getElementById("wall-radio-btn");
                
                if (title) title.textContent = station ? station.name : "Choose a station";
                if (state) state.textContent = status || (musicPlaying ? "Radio is playing" : "Ready when you are");
                if (meta) {
                    meta.textContent = usingSynthFallback
                    ? "Offline chill synth"
                    : station
                    ? [station.category === "filipino" ? "Filipino" : station.category === "english" ? "English" : station.category === "lofi" ? "Lo-Fi · Worldwide" : "Saved station", station.country].filter(Boolean).join(" · ")
                    : "Filipino · English · Lo-Fi worldwide";
                }
                if (playButton) {
                    const isPlaying = musicPlaying && !radioIsPaused;
                    const waitingForStations = !radioDirectoryLoaded && radioStations.length === 0;
                    playButton.disabled = waitingForStations;
                    playButton.classList.toggle("is-playing", isPlaying);
                    playButton.setAttribute("aria-pressed", String(isPlaying));
                    playButton.setAttribute("aria-label", waitingForStations ? "Loading stations" : radioIsPaused ? "Resume radio" : musicPlaying ? "Stop radio" : "Play radio");
                }
                if (playLabel) playLabel.textContent = !radioDirectoryLoaded && radioStations.length === 0 ? "Loading…" : radioIsPaused ? "Resume" : musicPlaying ? "Stop" : "Play";
                const volumeSlider = document.getElementById("music-volume-slider");
                const volumeLabel = document.getElementById("music-volume-val");
                if (volumeSlider) volumeSlider.value = String(Math.round(musicVolume * 100));
                if (volumeLabel) volumeLabel.textContent = Math.round(musicVolume * 100) + "%";
                if (autoDJButton) {
                    autoDJButton.textContent = radioAutoDJ ? "Auto-DJ on" : "Auto-DJ off";
                    autoDJButton.classList.toggle("btn-accent", radioAutoDJ);
                    autoDJButton.setAttribute("aria-pressed", String(radioAutoDJ));
                }
                if (toolButton) {
                    const isPlaying = musicPlaying && !radioIsPaused;
                    toolButton.classList.toggle("is-playing", isPlaying);
                    toolButton.setAttribute("aria-pressed", String(isPlaying));
                    toolButton.setAttribute("aria-label", radioIsPaused ? "Resume radio and open Radio Mode" : musicPlaying ? "Open radio controls" : "Play radio and open Radio Mode");
                }
                if (wallButton) {
                    const isPlaying = musicPlaying && !radioIsPaused;
                    wallButton.classList.toggle("is-playing", isPlaying);
                    wallButton.setAttribute("aria-pressed", String(isPlaying));
                    wallButton.setAttribute("aria-label", radioIsPaused ? "Resume radio and open Radio Mode" : musicPlaying ? "Open radio controls" : "Play radio and open Radio Mode");
                }
            }
            
            function updateMuteIcon(customStatus = null) {
                const btn = document.getElementById("mute-btn");
                const icon = document.getElementById("mute-icon");
                const status = document.getElementById("music-status");
                const volRow = document.getElementById("volume-row");
                const miniPill = document.getElementById("radio-mini-pill");
                const miniTitle = document.getElementById("radio-mini-title");
                
                if (musicPlaying) {
                    if (btn) {
                        btn.classList.add("playing");
                        btn.setAttribute("aria-pressed", "true");
                    }
                    const label = customStatus || "Live Radio Playing";
                    if (status) status.textContent = label;
                    if (volRow) volRow.hidden = false;
                    if (miniPill) miniPill.hidden = false;
                    if (miniTitle) miniTitle.textContent = label.replace(/^Live:\s*/i, "").replace(/\[[^\]]*\]\s*/, "");
                    if (icon) icon.innerHTML = `
                    <path d="M11 5L6 9H2v6h4l5 4V5z"></path>
                    <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                    <path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>`;
                } else {
                    if (btn) {
                        btn.classList.remove("playing");
                        btn.setAttribute("aria-pressed", "false");
                    }
                    if (status) status.textContent = "Off · Tap to tune in";
                    if (volRow) volRow.hidden = false;
                    if (miniPill) miniPill.hidden = true;
                    if (icon) icon.innerHTML = `
                    <path d="M11 5L6 9H2v6h4l5 4V5z"></path>
                    <line x1="23" y1="9" x2="17" y2="15"></line>
                    <line x1="17" y1="9" x2="23" y2="15"></line>`;
                }
                updateRadioModeUI(customStatus || "");
            }
            
            async function toggleMusic() {
                if (!musicPlaying && !radioDirectoryLoaded && radioStations.length === 0) {
                    updateMuteIcon("Loading stations…");
                    fetchRadioStations().then(stations => {
                        if (!musicPlaying) {
                            updateMuteIcon(stations.length ? "Stations ready — tap Play" : "No stations found — tap Play for offline chill");
                        }
                    }).catch(error => {
                        console.error("Unable to load radio stations.", error);
                        if (!musicPlaying) updateMuteIcon("Could not load stations");
                    });
                    return;
                }
                
                musicPlaying = !musicPlaying;
                radioIsPaused = false;
                haptic(8);
                
                if (musicPlaying) {
                    const volSlider = document.getElementById("music-volume-slider");
                    const volVal = document.getElementById("music-volume-val");
                    if (volSlider) volSlider.value = Math.round(musicVolume * 100);
                    if (volVal) volVal.textContent = Math.round(musicVolume * 100) + "%";
                    syncRadioAutoDJTimer();
                    
                    if (radioDirectoryLoaded && radioStations.length === 0) {
                        startSynthFallback("Offline chill synth ♪");
                        showToast("Offline chill synth ♪");
                        return;
                    }
                    
                    updateMuteIcon("Finding stations…");
                    await playCurrentStation(0);
                    if (musicPlaying) showToast("Radio is on ♪");
                } else {
                    clearInterval(radioAutoDJTimer);
                    radioAutoDJTimer = null;
                    if (radioAudio) {
                        radioAudio.pause();
                        radioAudio.removeAttribute("src");
                        radioAudio.load();
                    }
                    stopSynthFallback();
                    updateMuteIcon();
                    showToast("Radio stopped");
                }
            }
            
            function openRadioMode(playIfStopped = false) {
                const modal = document.getElementById("radio-mode-modal");
                if (!modal) return;
                modal.dataset.returnFocusId = document.activeElement?.id || "";
                modal.classList.add("open");
                modal.setAttribute("aria-hidden", "false");
                document.body.classList.add("radio-mode-open");
                const popover = document.getElementById("radio-pop");
                const miniButton = document.getElementById("radio-chip-btn");
                if (popover) popover.hidden = true;
                if (miniButton) miniButton.setAttribute("aria-expanded", "false");
                renderRadioStationList();
                updateRadioModeUI();
                if (!radioDirectoryLoaded) {
                    fetchRadioStations().catch(() => {
                        radioDirectoryLoaded = true;
                        renderRadioStationList();
                        updateMuteIcon("Could not load stations");
                    });
                }
                if (playIfStopped && (!musicPlaying || radioIsPaused)) toggleMusic();
                requestAnimationFrame(() => document.getElementById("radio-mode-close")?.focus());
            }
            
            function closeRadioMode() {
                const modal = document.getElementById("radio-mode-modal");
                if (!modal) return;
                modal.classList.remove("open");
                modal.setAttribute("aria-hidden", "true");
                document.body.classList.remove("radio-mode-open");
                const returnFocus = modal.dataset.returnFocusId && document.getElementById(modal.dataset.returnFocusId);
                if (returnFocus) returnFocus.focus();
            }
            
            function refreshRadioStations() {
                radioDirectoryLoaded = false;
                deadRadioUrls.clear();
                radioStations = favoriteRadios.slice();
                currentStationIdx = Math.max(0, radioStations.findIndex(station => station.url === selectedRadioUrl));
                renderRadioStationList();
                fetchRadioStations(true).catch(() => {
                    radioDirectoryLoaded = true;
                    renderRadioStationList();
                    updateMuteIcon("Could not load stations");
                });
            }
            
            document.addEventListener("keydown", event => {
                const modal = document.getElementById("radio-mode-modal");
                if (event.key === "Escape" && modal?.classList.contains("open")) closeRadioMode();
            });
            
            function playPopTone(freq = 520) {
                if (!musicPlaying || !audioCtx) return;
                const now = audioCtx.currentTime;
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.type = "sine";
                osc.frequency.setValueAtTime(freq, now);
                osc.frequency.exponentialRampToValueAtTime(freq * 1.4, now + 0.09);
                gain.gain.setValueAtTime(0.03, now);
                gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.11);
                osc.connect(gain);
                gain.connect(audioCtx.destination);
                osc.start(now);
                osc.stop(now + 0.12);
            }
            
            
            
            function installRadioConsent(askConsent) {
                const doubleTapMs = 2500;
                let radioStartedAt = 0;
                const favoriteTapAt = {};
                
                const originalToggleMusic = toggleMusic;
                toggleMusic = function () {
                    const event = window.event;
                    const byUser = !!(event && event.isTrusted);
                    if (!musicPlaying) {
                        radioStartedAt = performance.now();
                        return originalToggleMusic.apply(this, arguments);
                    }
                    if (byUser && performance.now() - radioStartedAt < doubleTapMs) {
                        askConsent("Stop the radio?", "You tapped twice in a row. Stop the live radio?",
                            () => originalToggleMusic(), { danger: true, okLabel: "Stop radio" });
                            return;
                        }
                        return originalToggleMusic.apply(this, arguments);
                    };
                    
                    const originalToggleFavorite = toggleFavoriteRadio;
                    toggleFavoriteRadio = function (station, event) {
                        if (!station || !station.url) return originalToggleFavorite.apply(this, arguments);
                        const removing = isStationFavorite(station.url);
                        const recent = performance.now() - (favoriteTapAt[station.url] || -1e9) < doubleTapMs;
                        if (removing && recent) {
                            if (event && event.stopPropagation) event.stopPropagation();
                            askConsent("Remove from favorites?", `"${station.name}" was just starred. Remove it from your favorite stations?`,
                                () => {
                                    favoriteTapAt[station.url] = performance.now();
                                    originalToggleFavorite(station, null);
                                }, { danger: true, okLabel: "Remove" });
                                return;
                            }
                            favoriteTapAt[station.url] = performance.now();
                            return originalToggleFavorite.apply(this, arguments);
                        };
                    }
                    
                    /* ---------- Native media notification bridge ---------- */
                    let lastNativeRadioKey = "";
                    
                    function pushRadioStateToNative() {
                        const bridge = window.AndroidRadio;
                        if (!bridge || typeof bridge.update !== "function") return;
                        
                        const station = radioStations[currentStationIdx];
                        const playing = musicPlaying && !radioIsPaused;
                        const title = usingSynthFallback ? "Offline chill synth" : (station ? station.name : "ARTcher Radio");
                        const subtitle = usingSynthFallback
                        ? "Offline"
                        : station
                        ? [station.category === "filipino" ? "Filipino" :
                            station.category === "english" ? "English" :
                            station.category === "lofi" ? "Lo-Fi" : "Saved station", station.country]
                            .filter(Boolean).join(" · ")
                            : "";
                            
                            const key = [title, subtitle, playing].join("|");
                            if (key === lastNativeRadioKey) return;
                            lastNativeRadioKey = key;
                            
                            try {
                                bridge.update(title, subtitle, playing);
                            } catch (error) {
                                logAppDiagnostic("warn", "Native radio bridge failed", error);
                            }
                        }
                        
                        // Called by the Android notification buttons / headset buttons
                        window.onNativeRadioCommand = function (command) {
                            switch (command) {
                                case "play":
                                if (!musicPlaying || radioIsPaused) toggleMusic();
                                break;
                                case "pause":
                                case "stop":
                                if (musicPlaying) toggleMusic();
                                break;
                                case "next":
                                nextRadioStation();
                                break;
                                case "prev":
                                prevRadioStation();
                                break;
                            }
                        };
                        