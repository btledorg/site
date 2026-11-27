
/* MODULE MAP (script blocks in this file)
main ................ state, studio tools, layers, shape layers, tracing, wall, events, seasons, weather
artcher-layout-js ... radio popover
artcher-v2-js ....... leaderboard, captcha, tile picker
artcher-busy-js ..... spinners / progress bar
artcher-curtain-js .. host curtain reveal
artcher-landscape-js  rail / panel / fullscreen
artcher-replay-js ... layer-aware render + replay engine
artcher-events2-js .. event library, QR, open-in-app
*/

const GAS_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbx0yXSNWkVCPjNGn9fFT4HRkKLgh7CJnNek604Be08n-oY3PaEDJZIapCGZlvxrvJE/exec";
const SUPABASE_URL = "https://hfxwmkrgmiftwdikouzj.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_gy8Ly-OisNJ9aQZkrZnojA_P5oQ8Vte";

var focusLinkRequested = new URLSearchParams(window.location.search).get("focus") === "1";
var focusModeActive = false;
var pendingWhatsNew = null;

const LOGO_PATH = "../resources/image/logo/archer.png";
const AUTO_UPLOAD = true;

const LS_QUEUE = "fw_pending_v1";
const LS_CACHE = "fw_cache_v1";
const LS_MUSIC_TIME = "fw_music_time_v1";
const LS_OPTIONS = "fw_options_v1";
const LS_PROFILE = "fw_profile_v1";
const LS_SAVED_COLORS = "fw_saved_colors_v1";
const LS_DRAFT = "fw_draft_v1";
const LS_WIPS = "fw_wips_v1";
const LS_ACTIVE_WIP = "fw_active_wip_v1";
const LS_BRUSH_PREFS = "fw_brush_prefs_v1";
const LS_REF_STATE = "fw_reference_state_v1";
const REF_DB_NAME = "freedomwall-local-assets";
const REF_DB_STORE = "references";

// =========================================================================
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

let audioCtx = null;
let radioAudio = null;
let favoriteRadios = lsGet(LS_FAV_RADIOS, []);
let deadRadioUrls = new Set();
let showFavRadiosOnly = false;
let radioStations = Array.isArray(favoriteRadios) ? favoriteRadios.slice() : [];
let currentStationIdx = 0;

function isStationFavorite(url) {
    return favoriteRadios.some(f => f.url === url);
}

function renameWipDraft() {
    const draft = wipDrafts.find(item => item.id === activeWipId);
    if (!draft) return;
    const modal = document.getElementById("rename-draft-modal");
    const input = document.getElementById("rename-draft-input");
    if (!modal || !input) return;
    modal.dataset.returnFocusId = document.activeElement && document.activeElement.id || "";
    input.value = draft.title || "";
    input.setCustomValidity("");
    modal.classList.add("open");
    requestAnimationFrame(() => {
        input.focus();
        input.select();
    });
}

function closeRenameDraftModal() {
    const modal = document.getElementById("rename-draft-modal");
    if (!modal) return;
    modal.classList.remove("open");
    const returnFocus = modal.dataset.returnFocusId && document.getElementById(modal.dataset.returnFocusId);
    if (returnFocus) returnFocus.focus();
}

document.addEventListener("keydown", event => {
    const modal = document.getElementById("rename-draft-modal");
    if (event.key === "Escape" && modal && modal.classList.contains("open")) closeRenameDraftModal();
});

function submitDraftRename(event) {
    event.preventDefault();
    const draft = wipDrafts.find(item => item.id === activeWipId);
    if (!draft) return closeRenameDraftModal();
    const input = document.getElementById("rename-draft-input");
    const title = (input ? input.value : "").trim().slice(0, 32);
    if (!title) {
        if (input) {
            input.setCustomValidity("Enter a name for this draft.");
            input.reportValidity();
        }
        return;
    }
    if (input) input.setCustomValidity("");
    draft.title = title;
    draft.updatedAt = Date.now();
    if (!persistWipDrafts()) return;
    closeRenameDraftModal();
    renderWipSelector();
    showToast("Draft renamed");
}

function toggleFavoriteRadio(station, e) {
    if (e) e.stopPropagation();
    if (!station || !station.url) return;
    const exists = isStationFavorite(station.url);
    if (exists) {
        favoriteRadios = favoriteRadios.filter(f => f.url !== station.url);
        showToast(`Removed from favorites: ${station.name}`);
    } else {
        favoriteRadios = [{ name: station.name, url: station.url, country: station.country || "" }].concat(favoriteRadios);
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

function toggleFavRadioFilter() {
    showFavRadiosOnly = !showFavRadiosOnly;
    const btn = document.getElementById("radio-fav-filter-btn");
    if (btn) btn.classList.toggle("btn-accent", showFavRadiosOnly);
    renderRadioStationList();
}

function pruneBrokenStation(station) {
    if (!station || !station.url) return;
    deadRadioUrls.add(station.url);
    radioStations = radioStations.filter(s => s.url !== station.url);
    if (isStationFavorite(station.url)) {
        favoriteRadios = favoriteRadios.filter(f => f.url !== station.url);
        lsSet(LS_FAV_RADIOS, favoriteRadios);
    }
    if (currentStationIdx >= radioStations.length) currentStationIdx = 0;
    renderRadioStationList();
    showToast(`Removed unplayable radio: ${station.name}`);
}
let musicPlaying = false;
let musicVolume = clamp(Number(lsGet(LS_MUSIC_VOL, 0.4)), 0, 1);
let usingSynthFallback = false;
let musicTimer = null;
let chordStep = 0;

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

const FAMOUS_STATIONS = {
    "PH": [
        "love radio", "magic 89.9", "wish 107.5", "monster", "barangay ls", "easy rock",
        "mellow 94.7", "idol", "retro 105.9", "kiss fm", "yes the best", "dzmm", "dzbb",
        "dwrr", "jam 88.3", "rj 100", "hit radio"
    ],
    "Lo-Fi": ["lofi girl", "chillhop", "lofi hip hop", "box lofi", "chilled cow", "lofi radio"],
    "Mainstream": ["bbc radio 1", "capital", "kiss", "z100", "hot 97", "nrj", "virgin radio", "energy", "power 105"]
};

async function fetchLiveLofiStations() {
    if (radioStations.some(s => !isStationFavorite(s.url))) return radioStations;
    
    const PER_CATEGORY = 15;
    const FETCH_LIMIT = "60";
    
    const common = {
        limit: FETCH_LIMIT,
        order: "clickcount",
        reverse: "true",
        hidebroken: "true",
        is_https: "true"
    };
    
    const categories = [
        { label: "PH",         query: { ...common, countrycode: "PH" } },
        { label: "Lo-Fi",      query: { ...common, tag: "lofi" } },
        { label: "Mainstream", query: { ...common, tag: "top 40" } }
    ];
    
    function rank(list, label) {
        const famous = (FAMOUS_STATIONS[label] || []).map(f => f.toLowerCase());
        const seenName = new Set();
        
        return list
        .filter(s =>
            s.url_resolved &&
            s.url_resolved.startsWith("https://") &&
            !s.url_resolved.endsWith(".m3u8") &&
            s.name
        )
        .filter(s => {
            const key = s.name.toLowerCase().replace(/[^a-z0-9]/g, "");
            if (!key || seenName.has(key)) return false;
            seenName.add(key);
            return true;
        })
        .map(s => {
            const nm = s.name.toLowerCase();
            const isFamous = famous.some(f => nm.includes(f));
            const score =
            (isFamous ? 1_000_000 : 0) +
            (s.clickcount || 0) +
            (s.votes || 0) * 5 +
            (s.clicktrend || 0) * 2 +
            ((s.bitrate || 0) >= 96 ? 50 : 0);
            return { s, score };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, PER_CATEGORY)
        .map(({ s }) => ({
            name: `[${label}] ${(s.name || "Radio").trim()}`.slice(0, 38),
            url: s.url_resolved,
            country: s.countrycode || ""
        }));
    }
    
    async function queryCategory({ label, query }) {
        const params = new URLSearchParams(query);
        for (const base of RADIO_API_ENDPOINTS) {
            const ctrl = new AbortController();
            const to = setTimeout(() => ctrl.abort(), 5000);
            try {
                const res = await fetch(`${base}?${params.toString()}`, { signal: ctrl.signal });
                clearTimeout(to);
                if (!res.ok) continue;
                const data = await res.json();
                const valid = rank(data, label);
                if (valid.length > 0) return valid;
            } catch (e) {
                clearTimeout(to);
            }
        }
        return [];
    }
    
    const buckets = await Promise.all(categories.map(queryCategory));
    
    const seen = new Set();
    const mixed = [];
    const maxLen = Math.max(0, ...buckets.map(b => b.length));
    
    for (let i = 0; i < maxLen; i++) {
        for (const bucket of buckets) {
            const st = bucket[i];
            if (st && !seen.has(st.url)) {
                seen.add(st.url);
                mixed.push(st);
            }
        }
    }
    
    const seenAll = new Set();
    const combined = [];
    for (const st of favoriteRadios.concat(mixed)) {
        if (!st || !st.url || deadRadioUrls.has(st.url) || seenAll.has(st.url)) continue;
        seenAll.add(st.url);
        combined.push(st);
    }
    radioStations = combined;
    sortStationsWithFavorites();
    renderRadioStationList();
    return radioStations;
}

function renderRadioStationList() {
    const list = document.getElementById("radio-station-list");
    if (!list) return;
    list.replaceChildren();
    const visibleStations = showFavRadiosOnly
    ? radioStations.filter(s => isStationFavorite(s.url))
    : radioStations;
    
    if (visibleStations.length === 0) {
        const empty = document.createElement("button");
        empty.type = "button";
        empty.className = "radio-station-option";
        empty.disabled = true;
        empty.innerHTML = showFavRadiosOnly
        ? "<span>No favorite stations yet · Tap ☆ to save one</span>"
        : "<span>No stations loaded yet</span>";
        list.appendChild(empty);
        return;
    }
    
    const activeUrl = radioStations[currentStationIdx]?.url;
    visibleStations.forEach((station) => {
        const realIndex = radioStations.findIndex(s => s.url === station.url);
        const isFav = isStationFavorite(station.url);
        const option = document.createElement("div");
        option.className = "radio-station-option";
        option.setAttribute("role", "button");
        option.tabIndex = 0;
        option.classList.toggle("active", station.url === activeUrl);
        
        const star = document.createElement("button");
        star.type = "button";
        star.className = "radio-fav-btn" + (isFav ? " is-fav" : "");
        star.textContent = isFav ? "★" : "☆";
        star.title = isFav ? "Remove from favorites" : "Add to favorites";
        star.setAttribute("aria-label", star.title);
        star.addEventListener("click", (e) => toggleFavoriteRadio(station, e));
        option.appendChild(star);
        
        const name = document.createElement("span");
        name.textContent = station.name;
        option.appendChild(name);
        
        if (station.country) {
            const country = document.createElement("small");
            country.textContent = station.country;
            option.appendChild(country);
        }
        
        option.addEventListener("click", () => selectRadioStation(realIndex));
        option.addEventListener("keydown", (e) => {
            if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                selectRadioStation(realIndex);
            }
        });
        list.appendChild(option);
    });
}

function selectRadioStation(index) {
    if (!radioStations.length) return;
    currentStationIdx = index;
    renderRadioStationList();
    if (!musicPlaying) {
        musicPlaying = true;
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
    const stations = await fetchLiveLofiStations();
    if (!musicPlaying) return;
    
    if (stations.length === 0 || attempt >= Math.min(4, stations.length)) {
        startSynthFallback("Offline chill synth ♪");
        return;
    }
    
    stopSynthFallback();
    const station = stations[currentStationIdx % stations.length];
    updateMuteIcon(`Connecting: ${station.name}...`);
    
    if (!radioAudio) {
        radioAudio = new Audio();
        radioAudio.crossOrigin = "anonymous";
        radioAudio.preload = "none";
    }
    
    radioAudio.volume = musicVolume;
    radioAudio.src = station.url;
    
    let settled = false;
    const failTimeout = setTimeout(() => {
        if (settled || !musicPlaying) return;
        settled = true;
        pruneBrokenStation(station);
        playCurrentStation(attempt + 1);
    }, 7000);
    
    radioAudio.onplaying = () => {
        clearTimeout(failTimeout);
        settled = true;
        if (!musicPlaying) return;
        const tag = station.country ? ` (${station.country})` : "";
        updateMuteIcon(`Live: ${station.name}${tag}`);
    };
    
    radioAudio.onerror = () => {
        clearTimeout(failTimeout);
        if (settled || !musicPlaying) return;
        settled = true;
        pruneBrokenStation(station);
        playCurrentStation(attempt + 1);
    };
    
    try {
        await radioAudio.play();
    } catch (err) {
        clearTimeout(failTimeout);
        if (!settled && musicPlaying) {
            settled = true;
            pruneBrokenStation(station);
            playCurrentStation(attempt + 1);
        }
    }
}

function setMusicVolume(val) {
    musicVolume = clamp(Number(val) / 100, 0, 1);
    lsSet(LS_MUSIC_VOL, musicVolume);
    const label = document.getElementById("music-volume-val");
    if (label) label.textContent = Math.round(musicVolume * 100) + "%";
    if (radioAudio) radioAudio.volume = musicVolume;
}

let radioAutoDJ = false;
let radioAutoDJTimer = null;
let radioSleepTimer = null;

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
    const btn = document.getElementById("radio-autodj-btn");
    if (btn) {
        btn.textContent = radioAutoDJ ? "Auto-DJ: On" : "Auto-DJ: Off";
        btn.classList.toggle("btn-accent", radioAutoDJ);
    }
    clearInterval(radioAutoDJTimer);
    if (radioAutoDJ) {
        if (!musicPlaying) toggleMusic();
        radioAutoDJTimer = setInterval(() => {
            if (musicPlaying && radioStations.length > 1) {
                const rand = Math.floor(Math.random() * radioStations.length);
                currentStationIdx = rand === currentStationIdx ? (rand + 1) % radioStations.length : rand;
                selectRadioStation(currentStationIdx);
            }
        }, 12 * 60 * 1000);
        showToast("Auto-DJ enabled (rotates every 12m)");
    } else {
        showToast("Auto-DJ turned off");
    }
}

function setRadioSleepTimer(minsStr) {
    const mins = Number(minsStr) || 0;
    clearTimeout(radioSleepTimer);
    if (mins <= 0) {
        showToast("Sleep timer off");
        return;
    }
    if (!musicPlaying) toggleMusic();
    radioSleepTimer = setTimeout(() => {
        if (musicPlaying) toggleMusic();
        const sel = document.getElementById("radio-sleep-select");
        if (sel) sel.value = "0";
        showToast("Sleep timer finished · Radio stopped");
    }, mins * 60 * 1000);
    showToast(`Radio will stop in ${mins} min`);
}

function updateMuteIcon(customStatus = null) {
    const btn = document.getElementById("mute-btn");
    const icon = document.getElementById("mute-icon");
    const status = document.getElementById("music-status");
    const volRow = document.getElementById("volume-row");
    const miniPill = document.getElementById("radio-mini-pill");
    const miniTitle = document.getElementById("radio-mini-title");
    
    if (musicPlaying) {
        btn.classList.add("playing");
        const label = customStatus || "Live Radio Playing";
        if (status) status.textContent = label;
        if (volRow) volRow.hidden = false;
        if (miniPill) miniPill.hidden = false;
        if (miniTitle) miniTitle.textContent = label.replace(/^Live:\s*/i, "").replace(/\[[^\]]*\]\s*/, "");
        icon.innerHTML = `
                    <path d="M11 5L6 9H2v6h4l5 4V5z"></path>
                    <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                    <path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>`;
    } else {
        btn.classList.remove("playing");
        if (status) status.textContent = "Off · Tap to tune in";
        if (volRow) volRow.hidden = true;
        if (miniPill) miniPill.hidden = true;
        icon.innerHTML = `
                    <path d="M11 5L6 9H2v6h4l5 4V5z"></path>
                    <line x1="23" y1="9" x2="17" y2="15"></line>
                    <line x1="17" y1="9" x2="23" y2="15"></line>`;
    }
}

async function toggleMusic() {
    musicPlaying = !musicPlaying;
    haptic(8);
    
    if (musicPlaying) {
        const volSlider = document.getElementById("music-volume-slider");
        const volVal = document.getElementById("music-volume-val");
        if (volSlider) volSlider.value = Math.round(musicVolume * 100);
        if (volVal) volVal.textContent = Math.round(musicVolume * 100) + "%";
        
        updateMuteIcon("Fetching live lo-fi stations...");
        await playCurrentStation(0);
        showToast("Live lo-fi radio on ♪");
    } else {
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

var hapticOn = true, lastHapticAt = 0, iosHapticLabel = null, v3Ready = false;
function haptic(ms = 8) {
    if (!hapticOn) return;
    const now = performance.now();
    if (now - lastHapticAt < 35) return;      // de-dupe stacked calls
    lastHapticAt = now;
    try {
        if (navigator.vibrate) { navigator.vibrate(ms); return; }
    } catch (e) {}
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

function popDoodle(el) {
    playPopTone(440 + Math.random() * 260);
    el.animate([
        { transform: "scale(1)" },
        { transform: "scale(1.3) rotate(14deg)" },
        { transform: "scale(1)" }
    ], { duration: 320, easing: "cubic-bezier(0.34, 1.56, 0.64, 1)" });
}

function launchConfetti() {
    const cvs = document.getElementById("confetti-canvas");
    const ctx = cvs.getContext("2d");
    cvs.width = window.innerWidth;
    cvs.height = window.innerHeight;
    const palette = ["#1d4ed8", "#dc2626", "#16a34a", "#d97706", "#7c3aed", "#db2777", "#0891b2"];
    const pieces = Array.from({ length: 70 }, () => ({
        x: cvs.width * (0.25 + Math.random() * 0.5),
        y: cvs.height * 0.45,
        vx: (Math.random() - 0.5) * 14,
        vy: -Math.random() * 14 - 4,
        size: 5 + Math.random() * 6,
        color: palette[Math.floor(Math.random() * palette.length)],
        rot: Math.random() * Math.PI * 2,
        vrot: (Math.random() - 0.5) * 0.25
    }));
    let frame = 0;
    function tick() {
        ctx.clearRect(0, 0, cvs.width, cvs.height);
        for (const p of pieces) {
            p.x += p.vx; p.y += p.vy; p.vy += 0.45; p.rot += p.vrot;
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rot);
            ctx.fillStyle = p.color;
            ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.65);
            ctx.restore();
        }
        frame++;
        if (frame < 75) requestAnimationFrame(tick);
        else ctx.clearRect(0, 0, cvs.width, cvs.height);
    }
    requestAnimationFrame(tick);
}

const COLORS = ["#0f172a", "#1d4ed8", "#dc2626", "#16a34a", "#d97706", "#7c3aed", "#db2777", "#0891b2"];
const CP_PRESETS = [
    "#000000", "#ffffff", "#64748b", "#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4",
    "#3b82f6", "#6366f1", "#a855f7", "#ec4899", "#f43f5e", "#854d0e", "#fde047", "#bbf7d0"
];
const SIZES = [2, 5, 10, 18, 28];
const TEXT_FS = [16, 22, 30, 42, 58, 76];
const FONT_FAMILIES = {
    "Inter": "'Inter', -apple-system, sans-serif",
    "Caveat": "'Caveat', cursive",
    "Playfair Display": "'Playfair Display', Georgia, serif",
    "Press Start 2P": "'Press Start 2P', monospace",
    "JetBrains Mono": "'JetBrains Mono', monospace",
    "Lobster": "'Lobster', cursive",
    "Pacifico": "'Pacifico', cursive",
    "Dancing Script": "'Dancing Script', cursive",
    "Satisfy": "'Satisfy', cursive",
    "Permanent Marker": "'Permanent Marker', cursive",
    "Gloria Hallelujah": "'Gloria Hallelujah', cursive",
    "Shadows Into Light": "'Shadows Into Light', cursive",
    "Bebas Neue": "'Bebas Neue', Impact, sans-serif",
    "Bangers": "'Bangers', Impact, cursive",
    "Righteous": "'Righteous', sans-serif",
    "Fredoka": "'Fredoka', sans-serif",
    "Abril Fatface": "'Abril Fatface', Georgia, serif",
    "Special Elite": "'Special Elite', 'Courier New', monospace",
    "Orbitron": "'Orbitron', sans-serif",
    "Creepster": "'Creepster', cursive"
};
const CELL_SIZE = 190;

function preloadAllFonts() {
    if (!document.fonts || !document.fonts.load) return;
    const jobs = Object.keys(FONT_FAMILIES).map(k =>
        document.fonts.load('700 24px "' + k + '"').catch(() => null));
        Promise.all(jobs).then(() => {
            try { tileBitmapCache.clear(); scheduleWallPaint(); } catch (e) {}
        });
    }
    
    let currentTool = "brush";
    let currentColor = COLORS[0];
    const savedBrushPrefs = lsGet(LS_BRUSH_PREFS, {});
    let currentSize = clamp(Number(savedBrushPrefs.size) || SIZES[1], 1, 60);
    let currentOpacity = 1;
    let currentBrushKind = ["pen", "marker", "highlighter", "dashed", "spray"].includes(savedBrushPrefs.kind) ? savedBrushPrefs.kind : "pen";
    let brushStabilizer = clamp(Number(savedBrushPrefs.stabilizer) || 0, 0, 100);
    let shapeFilled = false;
    let symmetryMode = "none";
    let defaultTextFs = 30;
    let defaultTextFont = "Inter";
    let smoothStrokes = true;
    let shiftPressed = false;
    
    let layers = [
        { id: "layer_base", name: "Layer 1", type: "draw", visible: true, opacity: 1, alphaLock: false, clipToBelow: false, strokes: [], redoStack: [] }
    ];
    let activeLayerId = "layer_base";
    let layerCounter = 1;
    
    function getActiveDrawLayer() {
        const isPaintable = l => l.type === "draw" && !l.shape;
        let lyr = layers.find(l => l.id === activeLayerId && isPaintable(l));
        if (!lyr) {
            lyr = layers.find(isPaintable);
            if (!lyr) {
                layerCounter++;
                lyr = { id: "layer_" + Date.now(), name: "Layer " + layerCounter, type: "draw", visible: true, opacity: 1, alphaLock: false, clipToBelow: false, strokes: [], redoStack: [] };
                layers.unshift(lyr);
            }
            activeLayerId = lyr.id;
        }
        return lyr;
    }

    function normalizeLayerClipping() {
        let hasDrawBelow = false;
        layers.forEach(layer => {
            if (layer.type !== "draw") return;
            if (!hasDrawBelow) layer.clipToBelow = false;
            hasDrawBelow = true;
        });
    }
    
    function getAllFlattenedStrokes(includeHidden = false) {
        const out = [];
        for (const lyr of layers) {
            if (!includeHidden && !lyr.visible) continue;
            let items = null;
            if (lyr.type === "draw") {
                items = lyr.strokes;
            } else if (lyr.type === "text" && lyr.textItem && (lyr.textItem.t || "").trim()) {
                const t = lyr.textItem;
                items = [{ k: "text", t: t.t.slice(0, 120), x: Math.round(t.x), y: Math.round(t.y), c: t.c, f: t.f, fn: t.fn || "Inter" }];
            }
            if (!items || !items.length) continue;
            out.push({ k: "ly", clip: !!lyr.clipToBelow, opacity: clamp(Number(lyr.opacity ?? 1), 0, 1) });
            for (const it of items) {
                if (it.hidden) continue;
                if (it.shape) {
                    const { shape, ...stroke } = it;
                    out.push(stroke);
                } else {
                    out.push(it);
                }
            }
        }
        return out;
    }
    
    Object.defineProperty(window, "strokes", {
        get() { return getActiveDrawLayer().strokes; },
        set(v) { getActiveDrawLayer().strokes = Array.isArray(v) ? v : []; }
    });
    Object.defineProperty(window, "redoStack", {
        get() { return getActiveDrawLayer().redoStack; },
        set(v) { getActiveDrawLayer().redoStack = Array.isArray(v) ? v : []; }
    });
    let currentStroke = null;
    let stabilizerPoint = null;
    let strokePointsSinceSave = 0;
    let mirrorStrokes = [];
    let shapeStart = null;
    let isDrawing = false;
    let isPreviewing = false;
    
    let studioScale = 1;
    let studioPanX = 0;
    let studioPanY = 0;
    let studioRotation = 0;
    let studioFlipX = false;
    let isStudioPanning = false;
    let studioPanStartX = 0;
    let studioPanStartY = 0;
    let spacePressed = false;
    let studioPinchDist = null;
    let studioPinchMidX = 0;
    let studioPinchMidY = 0;
    let studioPinchAngle = 0;
    let touchGesture = null;
    
    let serverEntries = [];
    let pending = [];
    let wallEntries = [];
    let wallTileAnimators = [];
    let loadingWall = false;
    let uploading = false;
    
    let panX = 0, panY = 0, scale = 1;
    let isPanning = false, startPanX = 0, startPanY = 0;
    let userMoved = false;
    let dragMoved = false;
    let downX = 0, downY = 0;
    
    function lsGet(key, fallback) {
        try {
            const v = localStorage.getItem(key);
            return v ? JSON.parse(v) : fallback;
        } catch (e) { return fallback; }
    }
    function lsSet(key, val) {
        try { localStorage.setItem(key, JSON.stringify(val)); return true; }
        catch (e) { return false; }
    }
    function lsRemove(key) {
        try { localStorage.removeItem(key); return true; }
        catch (e) { return false; }
    }
    
    // =========================================================================
    // DRAFT AUTO-SAVE
    // =========================================================================
    let draftSaveTimer = null;
    let wipDrafts = lsGet(LS_WIPS, []);
    if (!Array.isArray(wipDrafts)) wipDrafts = [];
    wipDrafts = wipDrafts.filter(d => d && typeof d.id === "string" && d.data);
    let activeWipId = lsGet(LS_ACTIVE_WIP, null);
    let draftStorageWarningShown = false;
    let protectedWipId = null;

    function emptyStudioDraft() {
        return {
            layers: [{ id: "layer_base", name: "Layer 1", type: "draw", visible: true, opacity: 1, alphaLock: false, clipToBelow: false, strokes: [] }],
            activeLayerId: "layer_base",
            bg: paperBg
        };
    }

    function serializeStudioDraft() {
        const serializedLayers = layers.map(l => {
            if (l.type === "draw") {
                return {
                    id: l.id, name: l.name, type: "draw", visible: l.visible,
                    alphaLock: !!l.alphaLock, clipToBelow: !!l.clipToBelow,
                    opacity: clamp(Number(l.opacity ?? 1), 0, 1),
                    strokes: l.strokes, shape: l.shape || null
                };
            }
            const t = l.textItem;
            return {
                id: l.id, name: l.name, type: "text", visible: l.visible,
                opacity: clamp(Number(l.opacity ?? 1), 0, 1),
                text: t ? { id: t.id, t: t.t, x: t.x, y: t.y, c: t.c, f: t.f, fn: t.fn } : null
            };
        });
        return { layers: serializedLayers, activeLayerId, bg: paperBg };
    }

    function persistWipDrafts() {
        const originalDrafts = wipDrafts.slice();
        while (true) {
            try {
                localStorage.setItem(LS_WIPS, JSON.stringify(wipDrafts));
                localStorage.setItem(LS_ACTIVE_WIP, JSON.stringify(activeWipId));
                draftStorageWarningShown = false;
                return true;
            } catch (error) {
                const quotaExceeded = error && (error.name === "QuotaExceededError" || error.code === 22 || error.code === 1014);
                const removable = wipDrafts.filter(d => d.id !== activeWipId && d.id !== protectedWipId).sort((a, b) => (a.updatedAt || 0) - (b.updatedAt || 0));
                if (quotaExceeded && removable.length) {
                    wipDrafts = wipDrafts.filter(d => d !== removable[0]);
                    continue;
                }
                if (!draftStorageWarningShown) {
                    console.error("Unable to save drawing drafts to localStorage.", error);
                    showToast("Draft autosave failed. Free device storage and try again.");
                    draftStorageWarningShown = true;
                }
                wipDrafts = originalDrafts;
                return false;
            }
        }
    }

    function saveCurrentWipNow() {
        if (!wipDrafts.length) {
            const legacy = lsGet(LS_DRAFT, null);
            wipDrafts = [{ id: "wip_" + Date.now(), title: "Draft 1", updatedAt: Date.now(), data: legacy || serializeStudioDraft() }];
            activeWipId = wipDrafts[0].id;
        }
        let active = wipDrafts.find(d => d.id === activeWipId);
        if (!active) {
            active = wipDrafts[0];
            activeWipId = active.id;
        }
        active.data = serializeStudioDraft();
        active.updatedAt = Date.now();
        return persistWipDrafts();
    }

    function scheduleDraftSave() {
        clearTimeout(draftSaveTimer);
        draftSaveTimer = setTimeout(saveCurrentWipNow, 350);
    }

    window.addEventListener("pagehide", () => {
        clearTimeout(draftSaveTimer);
        saveCurrentWipNow();
    });

    function renderWipSelector() {
        const select = document.getElementById("wip-select");
        if (!select) return;
        select.replaceChildren();
        wipDrafts.forEach(draft => {
            const option = document.createElement("option");
            option.value = draft.id;
            option.textContent = draft.title || "Untitled draft";
            select.appendChild(option);
        });
        select.value = activeWipId || (wipDrafts[0] && wipDrafts[0].id) || "";
        const remove = document.querySelector(".wip-controls button.btn-danger");
        if (remove) remove.disabled = wipDrafts.length <= 1;
    }

    function ensureWipDrafts() {
        let migratedLegacy = false;
        if (!wipDrafts.length) {
            const legacy = lsGet(LS_DRAFT, null);
            wipDrafts = [{
                id: "wip_" + Date.now(),
                title: "Draft 1",
                updatedAt: Date.now(),
                data: legacy || emptyStudioDraft()
            }];
            migratedLegacy = !!legacy;
        }
        wipDrafts.forEach((draft, index) => {
            if (!draft.title) draft.title = "Draft " + (index + 1);
            else if (/^WIP\s+\d+$/i.test(draft.title)) draft.title = draft.title.replace(/^WIP/i, "Draft");
        });
        if (!wipDrafts.some(d => d.id === activeWipId)) activeWipId = wipDrafts[0].id;
        if (wipDrafts.length > 3) {
            wipDrafts = wipDrafts.slice().sort((a, b) => {
                if (a.id === activeWipId) return -1;
                if (b.id === activeWipId) return 1;
                return (b.updatedAt || 0) - (a.updatedAt || 0);
            }).slice(0, 3);
        }
        if (persistWipDrafts() && migratedLegacy) {
            try { localStorage.removeItem(LS_DRAFT); } catch (error) {
                console.error("Unable to remove the migrated legacy draft.", error);
            }
        }
    }

    function switchWipDraft(id) {
        const next = wipDrafts.find(d => d.id === id);
        if (!next || id === activeWipId) return;
        clearTimeout(draftSaveTimer);
        protectedWipId = next.id;
        const saved = saveCurrentWipNow();
        protectedWipId = null;
        if (!saved) {
            renderWipSelector();
            return;
        }
        activeWipId = next.id;
        persistWipDrafts();
        loadDraft(next.data || emptyStudioDraft());
        showToast("Opened " + (next.title || "draft"));
    }

    function newWipDraft() {
        clearTimeout(draftSaveTimer);
        if (!saveCurrentWipNow()) return;
        if (wipDrafts.length >= 3) {
            const oldest = wipDrafts.filter(d => d.id !== activeWipId).sort((a, b) => (a.updatedAt || 0) - (b.updatedAt || 0))[0];
            if (oldest) wipDrafts = wipDrafts.filter(d => d !== oldest);
        }
        let index = 1;
        while (wipDrafts.some(d => d.title === "Draft " + index)) index++;
        const draft = { id: "wip_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6), title: "Draft " + index, updatedAt: Date.now(), data: emptyStudioDraft() };
        wipDrafts.unshift(draft);
        activeWipId = draft.id;
        persistWipDrafts();
        loadDraft(draft.data);
        showToast("Created " + draft.title + " · previous drafts auto-save");
    }

    function deleteWipDraft() {
        clearTimeout(draftSaveTimer);
        if (wipDrafts.length <= 1) {
            const active = wipDrafts[0];
            if (!active) return;
            active.data = emptyStudioDraft();
            active.updatedAt = Date.now();
            loadDraft(active.data);
            persistWipDrafts();
            showToast("Cleared the only drawing draft");
            return;
        }
        clearTimeout(draftSaveTimer);
        wipDrafts = wipDrafts.filter(d => d.id !== activeWipId);
        activeWipId = wipDrafts.slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0].id;
        persistWipDrafts();
        const active = wipDrafts.find(d => d.id === activeWipId);
        loadDraft(active.data || emptyStudioDraft());
        showToast("Deleted drawing draft");
    }

    Object.assign(window, { switchWipDraft, renameWipDraft, newWipDraft, deleteWipDraft });

    function loadDraft(draftOverride) {
        ensureWipDrafts();
        const active = wipDrafts.find(d => d.id === activeWipId);
        const draft = draftOverride || (active && active.data) || emptyStudioDraft();
        texts.forEach(item => item.el.remove());
        texts = [];
        textLayer.replaceChildren();
        layers = [];
        layerCounter = 1;
        if (typeof window.selectShape === "function") window.selectShape(null);
        if (draft && draft.bg) setPaper(draft.bg, true);
        if (draft && Array.isArray(draft.layers) && draft.layers.length > 0) {
            draft.layers.forEach((dl, idx) => {
                if (dl.type === "draw") {
                    layers.push({
                        id: dl.id || ("layer_" + idx),
                        name: dl.name || ("Layer " + (idx + 1)),
                        type: "draw",
                        visible: dl.visible !== false,
                        opacity: clamp(Number(dl.opacity ?? 1), 0, 1),
                        alphaLock: dl.alphaLock === true,
                        clipToBelow: dl.clipToBelow === true,
                        strokes: Array.isArray(dl.strokes) ? dl.strokes : [],
                        shape: dl.shape || null,
                        redoStack: []
                    });
                    layerCounter = Math.max(layerCounter, idx + 1);
                } else if (dl.type === "text" && dl.text) {
                    const item = addText(dl.text, true);
                    const lyr = layers.find(x => x.textItem === item);
                    if (lyr) {
                        lyr.id = dl.id || lyr.id;
                        lyr.name = dl.name || lyr.name;
                        lyr.visible = dl.visible !== false;
                        lyr.opacity = clamp(Number(dl.opacity ?? 1), 0, 1);
                        item.el.style.display = lyr.visible ? "" : "none";
                        item.el.style.opacity = String(lyr.opacity);
                    }
                }
            });
        } else if (draft) {
            if (Array.isArray(draft.strokes) && draft.strokes.length) {
                layers.push({ id: "layer_base", name: "Layer 1", type: "draw", visible: true, opacity: 1, alphaLock: false, clipToBelow: false, strokes: draft.strokes, redoStack: [] });
            }
            if (Array.isArray(draft.texts) && draft.texts.length) draft.texts.forEach(t => addText(t, true));
        }
        if (!layers.some(l => l.type === "draw")) {
            layers.unshift({ id: "layer_base", name: "Layer 1", type: "draw", visible: true, opacity: 1, alphaLock: false, clipToBelow: false, strokes: [], redoStack: [] });
        }
        normalizeLayerClipping();
        activeLayerId = (draft && draft.activeLayerId) || layers[0].id;
        if (!layers.some(l => l.id === activeLayerId && l.type === "draw")) activeLayerId = layers.find(l => l.type === "draw").id;
        syncTextLayerZOrder();
        deselectText();
        redrawStudio();
        updateHistoryUI();
        renderLayersPanel();
        renderWipSelector();
    }
    
    // =========================================================================
    // USER NICKNAME / PROFILE OVERLAY
    // =========================================================================
    let userProfile = lsGet(LS_PROFILE, null);
    
    const SEASON_GREETINGS = { christmas: "Merry Christmas", newyear: "Happy New Year", valentines: "Happy Valentine's Day", halloween: "Happy Halloween", philippines: "Mabuhay",
        lunar_new_year: "Gong Xi Fa Cai / Happy Lunar New Year",
        holy_week: "Blessed Holy Week",
        teachers_day: "Happy Teachers' Day",
        undas_all_saints: "Peace & Remembrance" };
        function greetingFor(username) {
            const g = activeSeason ? SEASON_GREETINGS[activeSeason.id] : "";
            if (!g) return username ? `Hi, ${username}!` : "";
            return username ? `${g}, ${username}!` : `${g}!`;
        }
        function applyProfileUI() {
            const greetingEl = document.getElementById("nav-greeting");
            const authorInput = document.getElementById("author-input");
            const moreNameEl = document.getElementById("more-profile-name");
            
            const isNamed = userProfile && !userProfile.anonymous && userProfile.username && userProfile.username.trim().length > 0;
            const cleanUsername = isNamed ? userProfile.username.trim().slice(0, 24) : "";
            
            if (greetingEl) {
                if (isNamed) {
                    greetingEl.textContent = greetingFor(cleanUsername);
                    greetingEl.hidden = false;
                } else {
                    greetingEl.textContent = greetingFor("");
                    greetingEl.hidden = !greetingEl.textContent;
                }
            }
            if (authorInput) authorInput.value = isNamed ? cleanUsername : "";
            if (moreNameEl) moreNameEl.textContent = isNamed ? cleanUsername : "Anonymous";
        }
        
        function toggleOverlayAnon(isAnon) {
            const input = document.getElementById("overlay-nickname-input");
            if (!input) return;
            input.disabled = isAnon;
            input.setAttribute("aria-disabled", isAnon ? "true" : "false");
            input.closest(".nickname-field")?.classList.toggle("is-anonymous", isAnon);
            if (!isAnon) input.focus();
        }
        
        function revampAnonymousOption() {
            const input = document.getElementById("overlay-nickname-input");
            let anonCheck = document.getElementById("overlay-anon-check");
            if (!input) return;
            
            if (!anonCheck) {
                anonCheck = document.createElement("input");
                anonCheck.type = "checkbox";
                anonCheck.id = "overlay-anon-check";
            }
            
            let row = anonCheck.closest("label") || anonCheck.parentElement;
            if (row && row !== anonCheck) {
                while (row.firstChild) row.removeChild(row.firstChild);
            } else {
                row = document.createElement("label");
            }
            
            const copy = document.createElement("span");
            copy.className = "nickname-anonymous-copy";
            copy.innerHTML = '<strong>Be anonymous</strong><small>Hide my nickname when I post</small>';
            
            row.classList.add("anon-check-row", "nickname-anonymous-option");
            row.appendChild(anonCheck);
            row.appendChild(copy);
            row.setAttribute("for", anonCheck.id);
            row.style.order = "2";
            
            input.insertAdjacentElement("afterend", row);
            anonCheck.checked = Boolean(userProfile && userProfile.anonymous);
            anonCheck.addEventListener("change", () => toggleOverlayAnon(anonCheck.checked));
            toggleOverlayAnon(anonCheck.checked);
        }
        
        function openNicknameOverlay(allowCancel = false) {
            const overlay = document.getElementById("nickname-overlay");
            const input = document.getElementById("overlay-nickname-input");
            const anonCheck = document.getElementById("overlay-anon-check");
            const cancelBtn = document.getElementById("overlay-cancel-btn");
            
            revampAnonymousOption();
            const checkedAnon = document.getElementById("overlay-anon-check");
            
            const isAnon = Boolean(userProfile && userProfile.anonymous);
            checkedAnon.checked = isAnon;
            input.value = (!isAnon && userProfile && userProfile.username) ? userProfile.username : "";
            toggleOverlayAnon(isAnon);
            cancelBtn.hidden = !allowCancel;
            
            overlay.hidden = false;
            if (!isAnon) setTimeout(() => input.focus(), 20);
        }
        
        function closeNicknameOverlay() {
            document.getElementById("nickname-overlay").hidden = true;
        }
        
        function saveNicknameOverlay(event) {
            if (event) event.preventDefault();
            const input = document.getElementById("overlay-nickname-input");
            const anonCheck = document.getElementById("overlay-anon-check");
            const isAnon = anonCheck.checked;
            const username = (input.value || "").trim().slice(0, 24);
            
            if (!isAnon && !username) {
                showToast("Please enter a nickname or check stay anonymous.");
                input.focus();
                return;
            }
            
            userProfile = {
                ...(userProfile || {}),
                username: isAnon ? "" : username,
                anonymous: isAnon
            };
            lsSet(LS_PROFILE, userProfile);
            applyProfileUI();
            closeNicknameOverlay();
            haptic(10);
            showToast(isAnon ? "Staying anonymous" : `Welcome, ${username}!`);
        }
        
        function handleStudioAuthorInput(val) {
            const username = (val || "").trim().slice(0, 24);
            userProfile = {
                ...(userProfile || {}),
                username,
                anonymous: !username
            };
            lsSet(LS_PROFILE, userProfile);
            
            const greetingEl = document.getElementById("nav-greeting");
            const moreNameEl = document.getElementById("more-profile-name");
            if (username) {
                greetingEl.textContent = greetingFor(username);
                greetingEl.hidden = false;
                moreNameEl.textContent = username;
            } else {
                greetingEl.textContent = greetingFor("");
                greetingEl.hidden = !greetingEl.textContent;
                moreNameEl.textContent = "Anonymous";
            }
        }
        
        function initUserProfile() {
            userProfile = lsGet(LS_PROFILE, null);
            applyProfileUI();
            if (!userProfile) openNicknameOverlay(false);
        }
        
        const LS_EVENT = "fw_event_v1";
        let curEvent = lsGet(LS_EVENT, null);
        function evCode() { return curEvent ? curEvent.code : ""; }
        function cacheKey() { return LS_CACHE + (curEvent ? ":" + curEvent.code : ""); }
        
        pending = lsGet(LS_QUEUE, []);
        serverEntries = lsGet(cacheKey(), []);
        rebuildEntries();
        
        function rebuildEntries() {
            const ids = new Set(serverEntries.map(e => e.id));
            wallEntries = serverEntries.concat(
                pending.filter(p => !ids.has(p.id) && (p.event || "") === evCode()).map(p => Object.assign({}, p, { _pending: true }))
            );
            updateWallCount();
            updateHistoryUI();
        }
        
        // =========================================================================
        // SUPABASE REALTIME CHANNEL
        // =========================================================================
        let wallChannel = null;
        const myPresenceKey = "user_" + Math.random().toString(36).slice(2, 9);
        
        function updateOnlineUI() {
            if (!wallChannel) return;
            const state = wallChannel.presenceState();
            const count = Math.max(1, Object.keys(state).length);
            const el = document.getElementById("online-count");
            if (el) el.textContent = String(count);
        }
        
        if (window.supabase && SUPABASE_URL && SUPABASE_ANON_KEY && !SUPABASE_ANON_KEY.includes("YOUR_")) {
            const sbClient = window.sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
            wallChannel = sbClient.channel("btled-freedom-wall-live", {
                config: {
                    broadcast: { self: false },
                    presence: { key: myPresenceKey }
                }
            });
            
            wallChannel
            .on("presence", { event: "sync" }, () => { updateOnlineUI(); })
            .on("broadcast", { event: "reaction" }, ({ payload }) => {
                if (!payload || !payload.id || !payload.counts) return;
                if (reactIdBusy(payload.id)) return;   // don't overwrite a reaction we are still saving
                reactions[payload.id] = payload.counts;
                updateTilePill(payload.id);
                if (modalEntry && modalEntry.id === payload.id) updateReactBar();
            })
            .on("broadcast", { event: "event-visibility" }, ({ payload }) => { if (window.onEventVisibility) window.onEventVisibility(payload); })
                .on("broadcast", { event: "new-tile" }, ({ payload }) => {
                if (!payload || !payload.id) return;
                if ((payload.event || "") !== evCode()) return;
                if (window.evHiddenForMe && window.evHiddenForMe()) return;
                if (wallEntries.some(e => e.id === payload.id)) return;
                
                const who = payload.author || "Anonymous";
                playPopTone(660);
                
                if (Array.isArray(payload.strokes)) {
                    serverEntries.push(payload);
                    lsSet(cacheKey(), serverEntries);
                    rebuildEntries();
                    
                    if (document.getElementById("view-wall").classList.contains("active")) {
                        createWallTile(payload, true, true);
                        if (!userMoved) fitWallToScreen();
                    }
                    showToast(`🎨 ${who} just posted! (${wallEntries.length} on wall)`);
                } else {
                    showToast(`🎨 ${who} just posted! Updating wall...`);
                    loadWallEntries({ autoPlay: false, manual: false, isLiveSync: true });
                }
            })
            .subscribe(async (status) => {
                if (status === "SUBSCRIBED") {
                    await wallChannel.track({ online_at: new Date().toISOString() });
                }
            });
        }
        
        async function broadcastWallEntry(entry) {
            if (!wallChannel || wallChannel.state !== "joined") return;
            try {
                const rawSize = JSON.stringify(entry).length;
                await wallChannel.send({
                    type: "broadcast",
                    event: "new-tile",
                    payload: (rawSize < 200000 && !(curEvent && curEvent.hidden && (entry.event || "") === curEvent.code))
                    ? entry
                    : { id: entry.id, author: entry.author, gx: entry.gx, gy: entry.gy, event: entry.event || "" }
                });
            } catch (e) {}
        }
        
        // =========================================================================
        // CUSTOM HSV COLOR PICKER + SAVED COLORS
        // =========================================================================
        let savedColors = lsGet(LS_SAVED_COLORS, []);
        let cpHue = 221;
        let cpSat = 0.86;
        let cpVal = 0.85;
        
        function hsvToHex(h, s, v) {
            const c = v * s;
            const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
            const m = v - c;
            let r = 0, g = 0, b = 0;
            if (h < 60) { r = c; g = x; }
            else if (h < 120) { r = x; g = c; }
            else if (h < 180) { g = c; b = x; }
            else if (h < 240) { g = x; b = c; }
            else if (h < 300) { r = x; b = c; }
            else { r = c; b = x; }
            const toHex = n => Math.round((n + m) * 255).toString(16).padStart(2, "0");
            return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
        }
        
        function hexToHsv(hex) {
            let clean = (hex || "#1d4ed8").replace("#", "");
            if (clean.length === 3) clean = clean.split("").map(c => c + c).join("");
            if (!/^[0-9a-fA-F]{6}$/.test(clean)) return { h: 221, s: 0.86, v: 0.85 };
            const r = parseInt(clean.slice(0, 2), 16) / 255;
            const g = parseInt(clean.slice(2, 4), 16) / 255;
            const b = parseInt(clean.slice(4, 6), 16) / 255;
            const max = Math.max(r, g, b), min = Math.min(r, g, b);
            const d = max - min;
            let h = 0;
            if (d !== 0) {
                if (max === r) h = 60 * (((g - b) / d) % 6);
                else if (max === g) h = 60 * ((b - r) / d + 2);
                else h = 60 * ((r - g) / d + 4);
            }
            if (h < 0) h += 360;
            const s = max === 0 ? 0 : d / max;
            return { h, s, v: max };
        }
        
        function renderSavedColorsUI() {
            const bar = document.getElementById("saved-colors-bar");
            const list = document.getElementById("saved-swatch-list");
            const modalGrid = document.getElementById("cp-saved-grid");
            list.innerHTML = "";
            modalGrid.innerHTML = "";
            
            if (savedColors.length === 0) {
                bar.hidden = true;
                modalGrid.innerHTML = `<span style="font-size:11.5px;color:var(--muted);">Custom colors you use or save will appear here.</span>`;
                return;
            }
            
            bar.hidden = false;
            savedColors.forEach(col => {
                const btn = document.createElement("button");
                btn.type = "button";
                btn.className = "saved-swatch" + (currentColor.toLowerCase() === col.toLowerCase() ? " active" : "");
                btn.style.backgroundColor = col;
                btn.title = col.toUpperCase();
                btn.onclick = () => selectColor(col, true);
                list.appendChild(btn);
                
                const mBtn = document.createElement("button");
                mBtn.type = "button";
                mBtn.className = "saved-swatch";
                mBtn.style.backgroundColor = col;
                mBtn.title = col.toUpperCase();
                mBtn.onclick = () => {
                    const hsv = hexToHsv(col);
                    cpHue = hsv.h; cpSat = hsv.s; cpVal = hsv.v;
                    updateCpCanvasAndUI();
                };
                modalGrid.appendChild(mBtn);
            });
        }
        
        function rememberUsedColor(hex) {
            const norm = hex.toLowerCase();
            if (COLORS.includes(norm)) return;
            savedColors = [norm].concat(savedColors.filter(c => c.toLowerCase() !== norm)).slice(0, 12);
            lsSet(LS_SAVED_COLORS, savedColors);
            renderSavedColorsUI();
        }
        
        function saveCurrentToPalette() {
            const hex = hsvToHex(cpHue, cpSat, cpVal).toLowerCase();
            savedColors = [hex].concat(savedColors.filter(c => c.toLowerCase() !== hex)).slice(0, 12);
            lsSet(LS_SAVED_COLORS, savedColors);
            renderSavedColorsUI();
            showToast(`Saved ${hex.toUpperCase()}`);
        }
        
        function drawCpSvSquare() {
            const cvs = document.getElementById("cp-sv-canvas");
            const ctx = cvs.getContext("2d");
            const w = cvs.width, h = cvs.height;
            
            ctx.fillStyle = `hsl(${cpHue}, 100%, 50%)`;
            ctx.fillRect(0, 0, w, h);
            
            const whiteGrad = ctx.createLinearGradient(0, 0, w, 0);
            whiteGrad.addColorStop(0, "rgba(255,255,255,1)");
            whiteGrad.addColorStop(1, "rgba(255,255,255,0)");
            ctx.fillStyle = whiteGrad;
            ctx.fillRect(0, 0, w, h);
            
            const blackGrad = ctx.createLinearGradient(0, 0, 0, h);
            blackGrad.addColorStop(0, "rgba(0,0,0,0)");
            blackGrad.addColorStop(1, "rgba(0,0,0,1)");
            ctx.fillStyle = blackGrad;
            ctx.fillRect(0, 0, w, h);
        }
        
        function updateCpCanvasAndUI(skipHexInput = false) {
            drawCpSvSquare();
            const hex = hsvToHex(cpHue, cpSat, cpVal);
            
            const svCursor = document.getElementById("cp-sv-cursor");
            svCursor.style.left = (cpSat * 100) + "%";
            svCursor.style.top = ((1 - cpVal) * 100) + "%";
            svCursor.style.backgroundColor = hex;
            
            const hueThumb = document.getElementById("cp-hue-thumb");
            hueThumb.style.left = ((cpHue / 360) * 100) + "%";
            hueThumb.style.backgroundColor = `hsl(${cpHue}, 100%, 50%)`;
            
            document.getElementById("cp-prev-new").style.backgroundColor = hex;
            if (!skipHexInput) {
                document.getElementById("cp-hex-input").value = hex.toUpperCase();
            }
        }
        
        function onCpHexInput(val) {
            let clean = val.trim();
            if (!clean.startsWith("#")) clean = "#" + clean;
            if (/^#[0-9a-fA-F]{6}$/.test(clean)) {
                const hsv = hexToHsv(clean);
                cpHue = hsv.h; cpSat = hsv.s; cpVal = hsv.v;
                updateCpCanvasAndUI(true);
            }
        }
        
        function openColorPicker() {
            const hsv = hexToHsv(currentColor);
            cpHue = hsv.h; cpSat = hsv.s; cpVal = hsv.v;
            document.getElementById("cp-prev-old").style.backgroundColor = currentColor;
            renderSavedColorsUI();
            document.getElementById("color-modal").classList.add("open");
            updateCpCanvasAndUI();
        }
        
        function closeColorPicker() {
            document.getElementById("color-modal").classList.remove("open");
        }
        
        function confirmColorPicker() {
            const hex = hsvToHex(cpHue, cpSat, cpVal);
            rememberUsedColor(hex);
            selectColor(hex, true);
            closeColorPicker();
            haptic(8);
        }
        
        function initCustomColorPickerEvents() {
            const svWrap = document.getElementById("cp-sv-wrap");
            const hueWrap = document.getElementById("cp-hue-wrap");
            const presetGrid = document.getElementById("cp-preset-grid");
            
            CP_PRESETS.forEach(col => {
                const b = document.createElement("button");
                b.type = "button";
                b.className = "cp-mini-swatch";
                b.style.backgroundColor = col;
                b.title = col.toUpperCase();
                b.onclick = () => {
                    const hsv = hexToHsv(col);
                    cpHue = hsv.h; cpSat = hsv.s; cpVal = hsv.v;
                    updateCpCanvasAndUI();
                };
                presetGrid.appendChild(b);
            });
            
            const handleSvPointer = (e) => {
                const rect = svWrap.getBoundingClientRect();
                const cx = e.touches ? e.touches[0].clientX : e.clientX;
                const cy = e.touches ? e.touches[0].clientY : e.clientY;
                cpSat = clamp((cx - rect.left) / rect.width, 0, 1);
                cpVal = 1 - clamp((cy - rect.top) / rect.height, 0, 1);
                updateCpCanvasAndUI();
            };
            
            let draggingSv = false;
            svWrap.addEventListener("pointerdown", (e) => {
                e.preventDefault();
                draggingSv = true;
                svWrap.setPointerCapture(e.pointerId);
                handleSvPointer(e);
            });
            svWrap.addEventListener("pointermove", (e) => { if (draggingSv) handleSvPointer(e); });
            svWrap.addEventListener("pointerup", () => { draggingSv = false; });
            svWrap.addEventListener("pointercancel", () => { draggingSv = false; });
            
            const handleHuePointer = (e) => {
                const rect = hueWrap.getBoundingClientRect();
                const cx = e.touches ? e.touches[0].clientX : e.clientX;
                cpHue = clamp(((cx - rect.left) / rect.width) * 360, 0, 359.9);
                updateCpCanvasAndUI();
            };
            
            let draggingHue = false;
            hueWrap.addEventListener("pointerdown", (e) => {
                e.preventDefault();
                draggingHue = true;
                hueWrap.setPointerCapture(e.pointerId);
                handleHuePointer(e);
            });
            hueWrap.addEventListener("pointermove", (e) => { if (draggingHue) handleHuePointer(e); });
            hueWrap.addEventListener("pointerup", () => { draggingHue = false; });
            hueWrap.addEventListener("pointercancel", () => { draggingHue = false; });
        }
        
        // =========================================================================
        // LOCAL REFERENCE / TRACING IMAGE (NEVER POSTED)
        // =========================================================================
        let refState = {
            loaded: false,
            visible: true,
            grayscale: false,
            x: 0,
            y: 0,
            scale: 1,
            opacity: 0.35,
            rot: 0
        };
        let refSaveTimer = null;
        let refDbPromise = null;
        let refWriteQueue = Promise.resolve();
        let refRestoreInProgress = false;

        function openReferenceDatabase() {
            if (!window.indexedDB) return Promise.reject(new Error("IndexedDB is unavailable"));
            if (refDbPromise) return refDbPromise;
            refDbPromise = new Promise((resolve, reject) => {
                const request = indexedDB.open(REF_DB_NAME, 1);
                let settled = false;
                request.onupgradeneeded = () => {
                    if (!request.result.objectStoreNames.contains(REF_DB_STORE)) request.result.createObjectStore(REF_DB_STORE);
                };
                request.onsuccess = () => {
                    if (settled) {
                        request.result.close();
                        return;
                    }
                    settled = true;
                    resolve(request.result);
                };
                request.onerror = () => {
                    settled = true;
                    refDbPromise = null;
                    reject(request.error || new Error("Unable to open reference image storage"));
                };
                request.onblocked = () => {
                    if (settled) return;
                    settled = true;
                    refDbPromise = null;
                    reject(new Error("Reference image storage is blocked by another tab"));
                };
            });
            return refDbPromise;
        }

        function referenceDraftPayload() {
            const image = document.getElementById("ref-img");
            return {
                src: image.getAttribute("src") || "",
                state: Object.assign({}, refState),
                overlayOn: typeof refOverlayOn === "undefined" ? true : refOverlayOn,
                overlayOpacity: Number(document.getElementById("ref-overlay-opacity").value),
                pickerMode: typeof refPickMode === "undefined" ? "auto" : refPickMode,
                savedAt: Date.now()
            };
        }

        function writeReferenceDraft(payload) {
            return openReferenceDatabase().then(db => new Promise((resolve, reject) => {
                const transaction = db.transaction(REF_DB_STORE, "readwrite");
                transaction.objectStore(REF_DB_STORE).put(payload, "active");
                transaction.oncomplete = () => { db.close(); refDbPromise = null; resolve(); };
                transaction.onerror = () => { db.close(); refDbPromise = null; reject(transaction.error || new Error("Unable to save reference image")); };
                transaction.onabort = () => { db.close(); refDbPromise = null; reject(transaction.error || new Error("Reference image save was aborted")); };
            }));
        }

        function readReferenceDraft() {
            return openReferenceDatabase().then(db => new Promise((resolve, reject) => {
                const transaction = db.transaction(REF_DB_STORE, "readonly");
                const request = transaction.objectStore(REF_DB_STORE).get("active");
                request.onsuccess = () => resolve(request.result || null);
                request.onerror = () => reject(request.error || new Error("Unable to read saved reference"));
                transaction.oncomplete = () => { db.close(); refDbPromise = null; };
                transaction.onerror = () => { db.close(); refDbPromise = null; reject(transaction.error || new Error("Unable to read saved reference")); };
                transaction.onabort = () => { db.close(); refDbPromise = null; reject(transaction.error || new Error("Reading the saved reference was aborted")); };
            }));
        }

        function scheduleReferenceDraftSave() {
            if (refRestoreInProgress || !refState.loaded) return;
            clearTimeout(refSaveTimer);
            refSaveTimer = setTimeout(() => {
                const payload = referenceDraftPayload();
                refWriteQueue = refWriteQueue.then(() => writeReferenceDraft(payload)).catch(error => {
                    console.error("Unable to save the reference image and settings.", error);
                    try {
                        localStorage.setItem(LS_REF_STATE, JSON.stringify(payload));
                    } catch (fallbackError) {
                        console.error("Reference image fallback storage failed.", fallbackError);
                        showToast("Trace image couldn't be saved. Device storage may be full.");
                    }
                });
            }, 250);
        }

        async function restoreReferenceDraft() {
            let payload = null;
            const fallback = lsGet(LS_REF_STATE, null);
            try {
                payload = await readReferenceDraft();
            } catch (error) {
                payload = fallback;
                if (!payload) return;
                console.warn("Using the local fallback for the saved reference image.", error);
            }
            if (fallback && (!payload || Number(fallback.savedAt || 0) > Number(payload.savedAt || 0))) payload = fallback;
            if (!payload || !payload.src || !payload.src.startsWith("data:image/")) return;
            const image = document.getElementById("ref-img");
            refRestoreInProgress = true;
            image.onload = () => {
                refState = Object.assign({
                    loaded: true, visible: true, grayscale: false, x: 0, y: 0, scale: 1, opacity: 0.35, rot: 0
                }, payload.state || {}, { loaded: true });
                refOverlayOn = payload.overlayOn !== false;
                refPickMode = payload.pickerMode === "ref" ? "ref" : "auto";
                document.getElementById("ref-opacity-slider").value = Math.round(refState.opacity * 100);
                document.getElementById("ref-scale-slider").value = Math.round(refState.scale * 100);
                document.getElementById("ref-rot-slider").value = refState.rot;
                document.getElementById("ref-overlay-opacity").value = Number.isFinite(Number(payload.overlayOpacity))
                    ? clamp(Number(payload.overlayOpacity), 0, 100) : 35;
                document.getElementById("ref-gray-btn").classList.toggle("active", refState.grayscale);
                document.getElementById("ref-vis-btn").textContent = refState.visible ? "Hide" : "Show";
                document.getElementById("ref-pick-btn").textContent = refPickMode === "ref" ? "Picker: Reference first" : "Picker: Auto";
                document.getElementById("ref-layer").hidden = false;
                document.getElementById("ref-empty-state").hidden = true;
                document.getElementById("ref-controls").hidden = false;
                document.getElementById("ref-tab-dot").hidden = false;
                updateRefTransform();
                syncRefOverlay();
                refRestoreInProgress = false;
            };
            image.onerror = () => {
                refRestoreInProgress = false;
                showToast("Saved trace image couldn't be restored");
            };
            image.src = payload.src;
        }

        function removeSavedReferenceDraft() {
            clearTimeout(refSaveTimer);
            refWriteQueue = refWriteQueue.then(() => openReferenceDatabase().then(db => new Promise((resolve, reject) => {
                const transaction = db.transaction(REF_DB_STORE, "readwrite");
                transaction.objectStore(REF_DB_STORE).delete("active");
                transaction.oncomplete = () => { db.close(); refDbPromise = null; resolve(); };
                transaction.onerror = () => { db.close(); refDbPromise = null; reject(transaction.error || new Error("Unable to remove the saved reference")); };
                transaction.onabort = () => { db.close(); refDbPromise = null; reject(transaction.error || new Error("Removing the saved reference was aborted")); };
            }))).catch(error => {
                if (window.indexedDB) {
                    console.error("Unable to remove the saved reference image.", error);
                    showToast("The trace image was removed but its saved copy couldn't be cleared");
                }
            }).then(() => {
                try { localStorage.removeItem(LS_REF_STATE); } catch (error) {
                    console.error("Unable to clear the saved reference fallback.", error);
                    showToast("The trace image was removed but its saved fallback couldn't be cleared");
                }
            });
        }

        window.addEventListener("pagehide", () => {
            if (!refState.loaded) return;
            clearTimeout(refSaveTimer);
            const payload = referenceDraftPayload();
            refWriteQueue = refWriteQueue.then(() => writeReferenceDraft(payload)).catch(error => {
                console.error("Unable to save the reference image while leaving the page.", error);
                try {
                    localStorage.setItem(LS_REF_STATE, JSON.stringify(payload));
                } catch (fallbackError) {
                    console.error("Reference image fallback storage failed while leaving the page.", fallbackError);
                }
            });
        });
        
        function handleRefUpload(event) {
            const file = event.target.files && event.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = document.getElementById("ref-img");
                img.src = e.target.result;
                refState = {
                    loaded: true,
                    visible: true,
                    grayscale: false,
                    x: 0,
                    y: 0,
                    scale: 1,
                    opacity: 0.35,
                    rot: 0
                };
                document.getElementById("ref-opacity-slider").value = 35;
                document.getElementById("ref-scale-slider").value = 100;
                document.getElementById("ref-rot-slider").value = 0;
                document.getElementById("ref-gray-btn").classList.remove("active");
                document.getElementById("ref-vis-btn").textContent = "Hide";
                
                document.getElementById("ref-layer").hidden = false;
                document.getElementById("ref-empty-state").hidden = true;
                document.getElementById("ref-controls").hidden = false;
                document.getElementById("ref-tab-dot").hidden = false;
                updateRefTransform();
                refOverlayOn = true;
                syncRefOverlay();
                scheduleReferenceDraftSave();
                showToast("Reference image loaded (local only)");
            };
            reader.readAsDataURL(file);
            event.target.value = "";
        }

        function extractReferencePalette() {
            const image = document.getElementById("ref-img");
            if (!refState.loaded || !image.complete || !image.naturalWidth) {
                showToast("Upload a reference image first");
                return;
            }
            const sample = document.createElement("canvas");
            sample.width = sample.height = 96;
            const ctx = sample.getContext("2d", { willReadFrequently: true });
            try {
                ctx.drawImage(image, 0, 0, sample.width, sample.height);
                const pixels = ctx.getImageData(0, 0, sample.width, sample.height).data;
                const buckets = new Map();
                for (let i = 0; i < pixels.length; i += 4) {
                    if (pixels[i + 3] < 128) continue;
                    const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
                    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
                    const bucket = buckets.get(key) || { count: 0, r: 0, g: 0, b: 0 };
                    bucket.count++;
                    bucket.r += r;
                    bucket.g += g;
                    bucket.b += b;
                    buckets.set(key, bucket);
                }
                const candidates = Array.from(buckets.values()).sort((a, b) => b.count - a.count).map(bucket => {
                    const hex = n => Math.round(n / bucket.count).toString(16).padStart(2, "0");
                    return { color: "#" + hex(bucket.r) + hex(bucket.g) + hex(bucket.b), r: bucket.r / bucket.count, g: bucket.g / bucket.count, b: bucket.b / bucket.count };
                });
                const palette = [];
                for (const candidate of candidates) {
                    if (palette.every(color => Math.hypot(candidate.r - color.r, candidate.g - color.g, candidate.b - color.b) >= 48)) {
                        palette.push(candidate);
                    }
                    if (palette.length === 6) break;
                }
                if (palette.length < 6) {
                    for (const candidate of candidates) {
                        if (!palette.some(color => color.color === candidate.color)) palette.push(candidate);
                        if (palette.length === 6) break;
                    }
                }

                if (!palette.length) {
                    showToast("Couldn't find visible colors in that image");
                    return;
                }
                const extractedColors = palette.map(color => color.color.toLowerCase());
                savedColors = extractedColors.concat(savedColors.filter(color => !extractedColors.includes(color.toLowerCase()))).slice(0, 12);
                lsSet(LS_SAVED_COLORS, savedColors);
                renderSavedColorsUI();
                showToast("Added " + palette.length + " colors from the reference");
            } catch (error) {
                console.error("Reference palette extraction failed.", error);
                showToast("Couldn't read colors from this reference image");
            } finally {
                sample.width = sample.height = 0;
            }
        }

        window.extractReferencePalette = extractReferencePalette;
        
        function updateRefTransform() {
            if (!refState.loaded) return;
            refState.opacity = Number(document.getElementById("ref-opacity-slider").value) / 100;
            refState.scale = Number(document.getElementById("ref-scale-slider").value) / 100;
            refState.rot = Number(document.getElementById("ref-rot-slider").value);
            
            document.getElementById("ref-opacity-val").textContent = Math.round(refState.opacity * 100) + "%";
            document.getElementById("ref-scale-val").textContent = Math.round(refState.scale * 100) + "%";
            document.getElementById("ref-rot-val").textContent = refState.rot + "°";
            
            const img = document.getElementById("ref-img");
            img.style.opacity = refState.visible ? refState.opacity : 0;
            img.style.filter = refState.grayscale ? "grayscale(100%) contrast(115%)" : "none";
            img.style.transform = `translate(${refState.x}px, ${refState.y}px) scale(${refState.scale}) rotate(${refState.rot}deg)`;
            syncRefOverlay();
            scheduleReferenceDraftSave();
        }
        
        function nudgeRef(dx, dy) {
            if (!refState.loaded) return;
            refState.x += dx;
            refState.y += dy;
            updateRefTransform();
        }
        
        function toggleRefGrayscale() {
            refState.grayscale = !refState.grayscale;
            document.getElementById("ref-gray-btn").classList.toggle("active", refState.grayscale);
            updateRefTransform();
        }
        
        function toggleRefVisibility() {
            refState.visible = !refState.visible;
            document.getElementById("ref-vis-btn").textContent = refState.visible ? "Hide" : "Show";
            updateRefTransform();
        }
        
        function resetRefTransform() {
            refState.x = 0;
            refState.y = 0;
            refState.scale = 1;
            refState.rot = 0;
            refState.opacity = 0.35;
            document.getElementById("ref-opacity-slider").value = 35;
            document.getElementById("ref-scale-slider").value = 100;
            document.getElementById("ref-rot-slider").value = 0;
            updateRefTransform();
        }
        
        function removeRefImage() {
            removeSavedReferenceDraft();
            refState.loaded = false;
            document.getElementById("ref-img").src = "";
            document.getElementById("ref-layer").hidden = true;
            document.getElementById("ref-controls").hidden = true;
            document.getElementById("ref-empty-state").hidden = false;
            document.getElementById("ref-tab-dot").hidden = true;
            syncRefOverlay();
            showToast("Reference image removed");
        }
        
        // =========================================================================
        // STUDIO TOOLS, SYMMETRY & SHAPE FILL
        // =========================================================================
        const drawCanvas = document.getElementById("draw-canvas");
        const drawCtx = drawCanvas.getContext("2d", { willReadFrequently: true });
        const previewCanvas = document.getElementById("preview-canvas");
        const previewCtx = previewCanvas.getContext("2d");
        const canvasFrame = document.getElementById("canvas-frame");
        const canvasStage = document.getElementById("canvas-stage");
        const textLayer = document.getElementById("text-layer");
        const collabPreviewCanvas = document.getElementById("collab-preview-canvas");
        const collabPreviewCtx = collabPreviewCanvas.getContext("2d");
        let collabChannel = null;
        let collabRoomId = null;
        let collabSelfKey = null;
        let collabIsHost = false;
        let collabHadHost = false;
        let collabSyncReady = false;
        let collabSharedLayerId = null;
        let collabStrokeSequence = 0;
        let collabCurrentStrokeId = null;
        let collabStrokePreviewTimer = null;
        let collabPointerTimer = null;
        let collabSyncTimer = null;
        let collabSyncToastAt = 0;
        let collabLastPointer = { x: 250, y: 250, active: false };
        let collabPointerKnown = false;
        let collabLastPointerSentAt = 0;
        let collabRemotePreview = [];
        let collabRemotePreviewGroupId = null;
        const collabCursors = new Map();
        const collabSeenStrokeIds = new Set();
        const collabSnapshotTransfers = new Map();
        const collabPendingStrokeCommits = [];
        
        var SHAPE_DEFS = [
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
            if (tool !== "hand" && !isShapeTool(tool)) selectShape(null);
            if (isShapeTool(tool)) syncShapePane();
            if (v3Ready) updateDrawHud();
            haptic(6);
        }
        
        function cycleSymmetry() {
            const order = ["none", "x", "y", "xy"];
            const labels = { none: "Off", x: "Mirror X", y: "Mirror Y", xy: "4-Way" };
            symmetryMode = order[(order.indexOf(symmetryMode) + 1) % order.length];
            
            const btn = document.getElementById("sym-btn");
            const label = document.getElementById("sym-label");
            const guides = document.getElementById("sym-guides");
            const lineV = document.getElementById("sym-line-v");
            const lineH = document.getElementById("sym-line-h");
            
            label.textContent = labels[symmetryMode];
            btn.classList.toggle("active", symmetryMode !== "none");
            guides.hidden = symmetryMode === "none";
            lineV.hidden = !(symmetryMode === "x" || symmetryMode === "xy");
            lineH.hidden = !(symmetryMode === "y" || symmetryMode === "xy");
            haptic(8);
            showToast("Symmetry: " + labels[symmetryMode]);
        }
        
        function getSymmetricPoints(pt) {
            const [x, y] = pt;
            const res = [[x, y]];
            if (symmetryMode === "x" || symmetryMode === "xy") res.push([500 - x, y]);
            if (symmetryMode === "y" || symmetryMode === "xy") res.push([x, 500 - y]);
            if (symmetryMode === "xy") res.push([500 - x, 500 - y]);
            return res;
        }
        
        function toggleShapeFill() {
            shapeFilled = !shapeFilled;
            applyStyleToSelectedShape();
            document.querySelectorAll("#shape-fill-btn, .shape-fill-toggle").forEach(b => b.classList.toggle("active", shapeFilled));
            const sg = document.getElementById("shape-grid"); if (sg) sg.classList.toggle("filled", shapeFilled);
            haptic(6);
            showToast(shapeFilled ? "Shapes will be filled" : "Shapes outline only");
        }
        
        function enableSheetTabDragging() {
            if (enableSheetTabDragging.bound) return;
            let drag = null;
            let suppressClick = false;
            document.querySelectorAll(".sheet-tabs").forEach(tabs => {
                let scrollTimer = 0;
                tabs.addEventListener("scroll", () => {
                    tabs.classList.add("is-scrolling");
                    window.clearTimeout(scrollTimer);
                    scrollTimer = window.setTimeout(() => tabs.classList.remove("is-scrolling"), 700);
                }, { passive: true });
            });
            document.addEventListener("pointerdown", event => {
                if (event.pointerType !== "mouse" || event.button !== 0) return;
                const tabs = event.target.closest && event.target.closest(".sheet-tabs");
                if (!tabs) return;
                drag = { tabs, pointerId: event.pointerId, startX: event.clientX, startScroll: tabs.scrollLeft, moved: false };
                tabs.classList.add("is-dragging");
            });
            document.addEventListener("pointermove", event => {
                if (!drag || event.pointerId !== drag.pointerId) return;
                const distance = event.clientX - drag.startX;
                if (Math.abs(distance) > 4) drag.moved = true;
                if (drag.moved) {
                    drag.tabs.scrollLeft = drag.startScroll - distance;
                    event.preventDefault();
                }
            }, { passive: false });
            document.addEventListener("pointerup", event => {
                if (!drag || event.pointerId !== drag.pointerId) return;
                drag.tabs.classList.remove("is-dragging");
                if (drag.moved) {
                    suppressClick = true;
                    window.setTimeout(() => { suppressClick = false; }, 0);
                }
                drag = null;
            });
            document.addEventListener("pointercancel", event => {
                if (!drag || event.pointerId !== drag.pointerId) return;
                drag.tabs.classList.remove("is-dragging");
                drag = null;
            });
            document.addEventListener("click", event => {
                if (!suppressClick || !event.target.closest || !event.target.closest(".sheet-tabs")) return;
                suppressClick = false;
                event.preventDefault();
                event.stopImmediatePropagation();
            }, true);
            enableSheetTabDragging.bound = true;
        }
        enableSheetTabDragging();

        function setDrawTab(name) {
            document.querySelectorAll(".sheet-tab").forEach(t => t.classList.toggle("active", t.dataset.pane === name));
            document.querySelectorAll(".sheet-pane").forEach(p => p.classList.toggle("active", p.id === "pane-" + name));
            const sheet = document.querySelector(".sheet");
            if (sheet) sheet.dataset.activePane = name;
            const activeTab = document.querySelector('.sheet-tab[data-pane="' + name + '"]');
            if (activeTab) activeTab.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
            haptic(6);
        }
        
        function setOpacity(val) {
            currentOpacity = clamp(Number(val) / 100, 0.1, 1);
            document.getElementById("opacity-val").textContent = Math.round(currentOpacity * 100) + "%";
            applyStyleToSelectedShape();
        }

        function saveBrushPrefs() {
            lsSet(LS_BRUSH_PREFS, { kind: currentBrushKind, stabilizer: brushStabilizer, size: currentSize });
        }

        function syncBrushControls() {
            const size = document.getElementById("brush-size-slider");
            const sizeVal = document.getElementById("brush-size-val");
            const kind = document.getElementById("brush-kind-select");
            const stabilizer = document.getElementById("brush-stabilizer-slider");
            const stabilizerVal = document.getElementById("brush-stabilizer-val");
            const shapeSize = document.getElementById("shape-size-slider");
            const shapeSizeVal = document.getElementById("shape-size-val");
            if (size) size.value = currentSize;
            if (sizeVal) sizeVal.textContent = currentSize + "px";
            if (kind) kind.value = currentBrushKind;
            if (stabilizer) stabilizer.value = brushStabilizer;
            if (stabilizerVal) stabilizerVal.textContent = brushStabilizer + "%";
            if (shapeSize) shapeSize.value = currentSize;
            if (shapeSizeVal) shapeSizeVal.textContent = currentSize + "px";
            document.querySelectorAll(".size-btn").forEach(button => {
                button.classList.toggle("active", Number(button.dataset.size) === currentSize);
            });
        }

        function setBrushSize(val) {
            currentSize = clamp(Number(val) || 1, 1, 60);
            syncBrushControls();
            saveBrushPrefs();
            applyStyleToSelectedShape();
        }

        function setBrushKind(kind) {
            if (!["pen", "marker", "highlighter", "dashed", "spray"].includes(kind)) return;
            currentBrushKind = kind;
            syncBrushControls();
            saveBrushPrefs();
        }

        function setBrushStabilizer(val) {
            brushStabilizer = clamp(Number(val) || 0, 0, 100);
            syncBrushControls();
            saveBrushPrefs();
        }

        Object.assign(window, { setBrushSize, setBrushKind, setBrushStabilizer });
        
        function selectColor(col, isCustomPad = false) {
            currentColor = col;
            applyStyleToSelectedShape();
            document.querySelectorAll(".swatch").forEach(el => el.classList.remove("active"));
            const padBtn = document.getElementById("color-pad-btn");
            if (isCustomPad) {
                padBtn.classList.add("active");
                padBtn.style.background = col;
            } else {
                padBtn.classList.remove("active");
                padBtn.style.background = "";
                document.querySelectorAll(".swatch").forEach(el => {
                    if (el.dataset.color && el.dataset.color.toLowerCase() === col.toLowerCase()) el.classList.add("active");
                });
            }
            renderSavedColorsUI();
            if (selectedText) {
                selectedText.c = col;
                selectedText.el.style.color = col;
                scheduleDraftSave();
            }
            if (!selectedShapeId && (currentTool === "eraser" || currentTool === "hand" || currentTool === "eyedropper")) {
                setTool("brush");
            }
        }
        
        function initStudioControls() {
            const swatchList = document.getElementById("swatch-list");
            const padBtn = document.getElementById("color-pad-btn");
            
            COLORS.forEach((col, i) => {
                const btn = document.createElement("button");
                btn.type = "button";
                btn.className = "swatch" + (i === 0 ? " active" : "");
                btn.dataset.color = col;
                btn.style.backgroundColor = col;
                btn.setAttribute("aria-label", "Color " + col);
                btn.onclick = () => selectColor(col, false);
                swatchList.insertBefore(btn, padBtn);
            });
            
            renderSavedColorsUI();
            initCustomColorPickerEvents();
            initUpgradeControls();
            initShapePane();
            initShapeEditor();
            initLayerDrag();
            initDrawHud();
            
            const sizeList = document.getElementById("size-list");
            SIZES.forEach((sz, i) => {
                const btn = document.createElement("button");
                btn.type = "button";
                btn.className = "size-btn" + (i === 1 ? " active" : "");
                btn.dataset.size = String(sz);
                btn.setAttribute("aria-label", "Brush size " + sz);
                const dot = document.createElement("span");
                dot.className = "size-dot";
                dot.style.width = Math.max(4, Math.min(20, sz * 0.7)) + "px";
                dot.style.height = Math.max(4, Math.min(20, sz * 0.7)) + "px";
                btn.appendChild(dot);
                btn.onclick = () => {
                    setBrushSize(sz);
                };
                sizeList.appendChild(btn);
            });
            syncBrushControls();
        }
        
        function showToast(msg) {
            const t = document.getElementById("toast");
            t.textContent = msg;
            t.classList.add("show");
            clearTimeout(t._timer);
            t._timer = setTimeout(() => t.classList.remove("show"), 3200);
        }
        
        // =========================================================================
        // TAB NAVIGATION (bottom nav)
        // =========================================================================
        const LS_LAST_VIEW = "fw_last_view_v1";
        const LS_TUTORIAL_PROMPTED = "fw_tutorial_prompted_v1";
        let currentView = "home";
        
        function switchView(viewName) {
            if (currentView === "draw" && viewName !== "draw") deselectText();
            if (currentView !== viewName) haptic(8);
            closeModal();
            currentView = viewName;
            
            document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
            document.getElementById("view-" + viewName).classList.add("active");
            document.querySelectorAll(".nav-item").forEach(n => n.classList.toggle("active", n.dataset.view === viewName));
            if (viewName === "home" || viewName === "draw" || viewName === "wall") lsSet(LS_LAST_VIEW, viewName);
            
            if (viewName === "draw") {
                syncUnit();
                applyStudioTransform();
                updateHistoryUI();
                loadWallEntries({ autoPlay: false, manual: false, isLiveSync: true });
            }
            
            if (viewName === "wall") {
                userMoved = false;
                renderWall(true);
                loadWallEntries({ autoPlay: true });
            }
        }

        const tutorialSteps = [
            { view: "home", target: ".landing-title", title: "Welcome to ARTcher", copy: "This short tour shows you how to draw, use the studio tools, post to the wall, join events, and collaborate. Use Next and Back to move through it; nothing is changed or posted for you." },
            { view: "home", target: ".landing-buttons .btn-primary", title: "Start a drawing", copy: "Choose Start drawing to open the studio. Your drawing stays on this device until you save or post it." },
            { view: "draw", pane: "style", target: "#canvas-frame", title: "Your canvas", copy: "Draw in this area with your selected tool. Use Undo and Redo if you want to reverse a stroke. On touch screens, you can draw directly with your finger or stylus.", focus: true },
            { view: "draw", pane: "style", target: ".tool-dock", title: "Choose a tool", copy: "Brush draws, Eraser removes marks, and Hand moves around the canvas or repositions text and reference images. Shapes, Fill, and Picker add more ways to work.", focus: true },
            { view: "draw", pane: "style", target: "#swatch-list", title: "Pick a color and brush style", copy: "Choose a color here. The Style panel also lets you adjust brush size, opacity, brush type, stabilizer, and paper color.", focus: true },
            { view: "draw", pane: "style", target: "#brush-size-slider", title: "Adjust brush size", copy: "Drag this slider to change the brush size. Your brush and color settings apply to new strokes.", focus: true },
            { view: "draw", pane: "style", target: ".studio-zoom-group", title: "Zoom and move the view", copy: "Use the plus and minus buttons to zoom, tap the percentage to reset, and use rotate or flip when helpful. Zooming changes the view, not the artwork itself.", focus: true },
            { view: "draw", pane: "ref", target: function () { return document.getElementById("ref-controls").hidden ? document.getElementById("ref-empty-state") : document.querySelector("#ref-controls .slider-row"); }, title: "Add a reference image", copy: "In Trace, upload an image from your device to use as a guide. Adjust its size, opacity, and rotation, then hide or remove it when you are done.", focus: true },
            { view: "draw", pane: "text", target: "#pane-text .text-tools", title: "Add and edit text", copy: "Add text to the canvas, choose a font, and resize it. Select the text to move it; Stamp bakes it into the artwork so it becomes part of the drawing.", focus: true },
            { view: "draw", pane: "layers", target: "#pane-layers .wip-controls", title: "Use layers and drafts", copy: "Layers keep drawing and text elements separate, so you can select, hide, or edit parts independently. Drafts let you keep multiple works in progress on this device.", focus: true },
            { view: "draw", pane: "shapes", target: "#shape-grid", title: "Draw precise shapes", copy: "Pick a shape, then drag on the canvas to create it. You can adjust its stroke and fill, and edit a selected shape afterward.", focus: true },
            { view: "draw", pane: "post", target: "#submit-btn", title: "Save, share, or post", copy: "Post to wall sends your drawing to the current wall. The other buttons let you save a PNG, share it, replay the drawing, or make a video. Posting is never triggered by this tour.", focus: true },
            { view: "wall", target: ".wall-fab", title: "Explore the wall", copy: "Drag the wall to move around, and use its controls to zoom, refresh, or view the minimap. Tap a drawing to open its details and reactions." },
            { view: "wall", target: "#event-btn", title: "Open event options", copy: "Events have their own wall. Open Event to join with a code or QR invite, or to manage an event you host." },
            { view: "wall", eventModal: true, target: "#event-code-input", title: "Join with a code", copy: "Enter the event code you received, or use the QR scan option on the next step. Invites are handled inside ARTcher." },
            { view: "wall", eventModal: true, target: ".ev-scan-btn", title: "Scan an invite QR", copy: "The scanner can read event and collaboration invites. It will ask for camera permission only if you choose to start the scanner; you can also paste a code or link instead." },
            { view: "wall", eventModal: true, hostDetails: true, target: "#event-host > summary", title: "Host and focus an event", copy: "Hosts can create an event, hide or reveal its art, and choose whether invite links open directly in the drawing studio with focus mode. This tour does not change those settings." },
            { view: "draw", pane: "team", target: function () { var start = document.getElementById("collab-start-btn"); var leave = document.getElementById("collab-leave-btn"); return start && !start.hidden ? start : (leave && !leave.hidden ? leave : document.querySelector("#pane-team .collab-actions")); }, title: "Draw together in Teams", copy: "Start a shared room or join with an invite link or QR. Strokes and pointers sync live between two artists. Joining a room replaces the current drawing, so save or switch drafts first.", focus: true },
            { view: "more", target: "#acct-profile-card", title: "Profile and preferences", copy: "More contains your guest name, optional account sign-in, upload status, and app preferences. You can use ARTcher as a guest; an account is optional." },
            { view: "home", target: ".landing-title", title: "You're ready to create", copy: "That covers the main ARTcher workflows. You can restart this guided tour at any time using the information button in the top bar—or the studio toolbar in focus mode." }
        ];
        let tutorialStepsForRun = [];
        let tutorialIndex = 0;
        let tutorialReturnState = null;
        let tutorialReturnFocus = null;
        let tutorialPromptResolved = lsGet(LS_TUTORIAL_PROMPTED, false) === true;

        function maybePromptTutorial() {
            if (tutorialPromptResolved || focusModeActive || focusLinkRequested) return;
            const prompt = document.getElementById("tutorial-first-prompt");
            const auth = document.getElementById("auth-overlay");
            if (!prompt || (auth && !auth.hidden) || document.querySelector(".modal-backdrop.open")) return;
            prompt.hidden = false;
        }
        window.maybePromptTutorial = maybePromptTutorial;

        function dismissTutorialPrompt(startTour) {
            const prompt = document.getElementById("tutorial-first-prompt");
            if (prompt) prompt.hidden = true;
            tutorialPromptResolved = true;
            if (!lsSet(LS_TUTORIAL_PROMPTED, true)) {
                console.error("Could not save the first-time tutorial choice to local storage.");
                showToast("Your tutorial choice could not be saved on this device.");
            }
            if (startTour) startTutorial();
        }

        function tutorialTarget(step) {
            if (!step || !step.target) return null;
            return typeof step.target === "function" ? step.target() : document.querySelector(step.target);
        }

        function prepareTutorialStep(step) {
            const eventModal = document.getElementById("event-modal");
            if (eventModal && eventModal.classList.contains("open") && !step.eventModal) closeEventModal();
            if (step.view && currentView !== step.view) switchView(step.view);
            if (step.pane) {
                setDrawTab(step.pane);
                if (step.pane === "layers") renderLayersPanel();
                if (step.pane === "shapes") syncShapePane();
            }
            if (step.eventModal) openEventModal();
            if (step.hostDetails) {
                const hostDetails = document.getElementById("event-host");
                if (hostDetails) hostDetails.open = true;
            }
        }

        function positionTutorial() {
            const overlay = document.getElementById("tutorial-overlay");
            if (!overlay || overlay.hidden) return;
            const step = tutorialStepsForRun[tutorialIndex];
            const target = tutorialTarget(step);
            const card = document.getElementById("tutorial-card");
            const highlight = document.getElementById("tutorial-highlight");
            const shade = document.getElementById("tutorial-shade");
            const maskBase = document.getElementById("tutorial-mask-base");
            const maskCutout = document.getElementById("tutorial-mask-cutout");
            const maskDim = document.getElementById("tutorial-mask-dim");
            const width = document.documentElement.clientWidth;
            const height = document.documentElement.clientHeight;
            let rect = null;
            if (target && target.getClientRects().length) {
                const style = window.getComputedStyle(target);
                if (style.display !== "none" && style.visibility !== "hidden") rect = target.getBoundingClientRect();
            }

            shade.setAttribute("viewBox", "0 0 " + width + " " + height);
            maskBase.setAttribute("width", width);
            maskBase.setAttribute("height", height);
            maskDim.setAttribute("width", width);
            maskDim.setAttribute("height", height);

            if (rect && rect.width > 0 && rect.height > 0) {
                const left = Math.max(4, rect.left - 7);
                const top = Math.max(4, rect.top - 7);
                const right = Math.min(width - 4, rect.right + 7);
                const bottom = Math.min(height - 4, rect.bottom + 7);
                maskCutout.setAttribute("x", left);
                maskCutout.setAttribute("y", top);
                maskCutout.setAttribute("width", Math.max(0, right - left));
                maskCutout.setAttribute("height", Math.max(0, bottom - top));
                highlight.style.display = "block";
                highlight.style.left = left + "px";
                highlight.style.top = top + "px";
                highlight.style.width = Math.max(0, right - left) + "px";
                highlight.style.height = Math.max(0, bottom - top) + "px";
            } else {
                maskCutout.setAttribute("width", 0);
                maskCutout.setAttribute("height", 0);
                highlight.style.display = "none";
            }

            const cardRect = card.getBoundingClientRect();
            const cardWidth = cardRect.width;
            const cardHeight = cardRect.height;
            let left = (width - cardWidth) / 2;
            let top = (height - cardHeight) / 2;
            if (rect && rect.width > 0 && rect.height > 0) {
                left = rect.left + rect.width / 2 - cardWidth / 2;
                if (rect.bottom + cardHeight + 20 <= height - 12) top = rect.bottom + 14;
                else if (rect.top - cardHeight - 14 >= 12) top = rect.top - cardHeight - 14;
                else top = Math.max(12, height - cardHeight - 12);
            }
            card.style.left = Math.max(12, Math.min(left, width - cardWidth - 12)) + "px";
            card.style.top = Math.max(12, Math.min(top, height - cardHeight - 12)) + "px";
        }

        function showTutorialStep() {
            const step = tutorialStepsForRun[tutorialIndex];
            if (!step) return;
            prepareTutorialStep(step);
            const target = tutorialTarget(step);
            if (target && target.getClientRects().length) target.scrollIntoView({ behavior: "auto", block: "nearest", inline: "nearest" });
            document.getElementById("tutorial-progress").textContent = "Step " + (tutorialIndex + 1) + " of " + tutorialStepsForRun.length;
            document.getElementById("tutorial-title").textContent = step.title;
            document.getElementById("tutorial-copy").textContent = step.copy;
            document.getElementById("tutorial-back").disabled = tutorialIndex === 0;
            document.getElementById("tutorial-next").textContent = tutorialIndex === tutorialStepsForRun.length - 1 ? "Finish" : "Next";
            window.requestAnimationFrame(positionTutorial);
        }

        function startTutorial() {
            if (tutorialReturnState) return;
            const activeTab = document.querySelector(".sheet-tab.active");
            tutorialReturnState = { view: currentView, pane: activeTab ? activeTab.dataset.pane : "style" };
            tutorialReturnFocus = document.activeElement;
            tutorialStepsForRun = focusModeActive ? tutorialSteps.filter(function (step) { return step.focus; }) : tutorialSteps.slice();
            tutorialIndex = 0;
            document.getElementById("tutorial-overlay").hidden = false;
            showTutorialStep();
            document.getElementById("tutorial-next").focus();
        }

        function tutorialNext() {
            if (tutorialIndex >= tutorialStepsForRun.length - 1) {
                closeTutorial();
                return;
            }
            tutorialIndex++;
            showTutorialStep();
        }

        function tutorialBack() {
            if (tutorialIndex <= 0) return;
            tutorialIndex--;
            showTutorialStep();
        }

        function closeTutorial() {
            if (!tutorialReturnState) return;
            const returnState = tutorialReturnState;
            const returnFocus = tutorialReturnFocus;
            tutorialReturnState = null;
            tutorialReturnFocus = null;
            tutorialStepsForRun = [];
            document.getElementById("tutorial-overlay").hidden = true;
            const eventModal = document.getElementById("event-modal");
            if (eventModal && eventModal.classList.contains("open")) closeEventModal();
            if (!focusModeActive && currentView !== returnState.view) switchView(returnState.view);
            if (returnState.view === "draw" && returnState.pane) setDrawTab(returnState.pane);
            if (returnFocus && document.contains(returnFocus) && typeof returnFocus.focus === "function") returnFocus.focus();
        }

        document.addEventListener("keydown", function (event) {
            const overlay = document.getElementById("tutorial-overlay");
            if (!overlay || overlay.hidden) return;
            if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                closeTutorial();
                return;
            }
            if (event.key === "Tab") {
                const controls = Array.prototype.slice.call(overlay.querySelectorAll("button:not(:disabled)"));
                if (!controls.length) return;
                const first = controls[0];
                const last = controls[controls.length - 1];
                if (event.shiftKey && document.activeElement === first) {
                    event.preventDefault();
                    last.focus();
                } else if (!event.shiftKey && document.activeElement === last) {
                    event.preventDefault();
                    first.focus();
                }
            }
        }, true);
        window.addEventListener("resize", positionTutorial);
        
        function clampStudioPan() {
            const w = canvasFrame.clientWidth || 460;
            const h = canvasFrame.clientHeight || 460;
            const radians = studioRotation * Math.PI / 180;
            const extentX = studioScale * (Math.abs(Math.cos(radians)) * w + Math.abs(Math.sin(radians)) * h);
            const extentY = studioScale * (Math.abs(Math.sin(radians)) * w + Math.abs(Math.cos(radians)) * h);
            const minX = w - extentX;
            const minY = h - extentY;
            studioPanX = Math.min(0, Math.max(minX, studioPanX));
            studioPanY = Math.min(0, Math.max(minY, studioPanY));
        }

        function transformStudioVector(x, y, viewScale, rotation, flipX) {
            x *= viewScale;
            y *= viewScale;
            if (flipX) x = -x;
            const radians = rotation * Math.PI / 180;
            return [x * Math.cos(radians) - y * Math.sin(radians), x * Math.sin(radians) + y * Math.cos(radians)];
        }

        function inverseStudioVector(x, y, viewScale, rotation, flipX) {
            const radians = -rotation * Math.PI / 180;
            const rx = x * Math.cos(radians) - y * Math.sin(radians);
            const ry = x * Math.sin(radians) + y * Math.cos(radians);
            return [(flipX ? -rx : rx) / viewScale, ry / viewScale];
        }
        
        function applyStudioTransform() {
            if (Math.abs(studioScale - 1) <= 0.001 && Math.abs(studioRotation % 360) < 0.001) {
                studioScale = 1;
                studioPanX = 0;
                studioPanY = 0;
            } else {
                clampStudioPan();
            }
            canvasStage.style.transform = `translate(${studioPanX}px, ${studioPanY}px) rotate(${studioRotation}deg) scaleX(${studioFlipX ? -1 : 1}) scale(${studioScale})`;
            document.getElementById("studio-zoom-label").textContent = Math.round(studioScale * 100) + "%";
            const flipButton = document.getElementById("studio-flip-btn");
            if (flipButton) flipButton.setAttribute("aria-pressed", studioFlipX ? "true" : "false");
            updateShapeOverlay();
        }
        
        function zoomStudioAt(newScale, anchorX, anchorY) {
            const clampedScale = Math.min(4, Math.max(0.1, newScale));
            const w = canvasFrame.clientWidth || 460, h = canvasFrame.clientHeight || 460;
            const cx = anchorX !== undefined ? anchorX : w / 2;
            const cy = anchorY !== undefined ? anchorY : h / 2;
            const local = inverseStudioVector(cx - w / 2 - studioPanX, cy - h / 2 - studioPanY, studioScale, studioRotation, studioFlipX);
            const projected = transformStudioVector(local[0], local[1], clampedScale, studioRotation, studioFlipX);
            studioPanX = cx - w / 2 - projected[0];
            studioPanY = cy - h / 2 - projected[1];
            studioScale = clampedScale;
            applyStudioTransform();
        }

        function rotateStudioAt(newRotation, anchorX, anchorY) {
            const w = canvasFrame.clientWidth || 460, h = canvasFrame.clientHeight || 460;
            const cx = anchorX !== undefined ? anchorX : w / 2;
            const cy = anchorY !== undefined ? anchorY : h / 2;
            const local = inverseStudioVector(cx - w / 2 - studioPanX, cy - h / 2 - studioPanY, studioScale, studioRotation, studioFlipX);
            studioRotation = newRotation;
            const projected = transformStudioVector(local[0], local[1], studioScale, studioRotation, studioFlipX);
            studioPanX = cx - w / 2 - projected[0];
            studioPanY = cy - h / 2 - projected[1];
            applyStudioTransform();
        }
        
        function zoomStudio(factor) { zoomStudioAt(studioScale * factor); }
        
        function resetStudioZoom() {
            studioScale = 1;
            studioPanX = 0;
            studioPanY = 0;
            studioRotation = 0;
            studioFlipX = false;
            applyStudioTransform();
        }

        function toggleStudioFlip() {
            studioFlipX = !studioFlipX;
            applyStudioTransform();
            haptic(6);
            showToast(studioFlipX ? "Canvas view flipped" : "Canvas view restored");
        }

        function rotateStudioBy(degrees) {
            rotateStudioAt(studioRotation + degrees);
            haptic(6);
        }

        Object.assign(window, { toggleStudioFlip, rotateStudioBy });
        
        canvasFrame.addEventListener("wheel", (e) => {
            e.preventDefault();
            const rect = canvasFrame.getBoundingClientRect();
            zoomStudioAt(studioScale * (e.deltaY < 0 ? 1.15 : 0.85), e.clientX - rect.left - canvasFrame.clientLeft, e.clientY - rect.top - canvasFrame.clientTop);
        }, { passive: false });
        
        window.addEventListener("keydown", (e) => {
            if (e.key === "Shift") shiftPressed = true;
            
            if (document.activeElement.tagName === "INPUT" || document.activeElement.isContentEditable) return;
            if (!document.getElementById("nickname-overlay").hidden) return;
            if (document.getElementById("color-modal").classList.contains("open")) return;
            if (!document.getElementById("view-draw").classList.contains("active")) return;
            
            if (e.code === "Space") {
                e.preventDefault();
                spacePressed = true;
                canvasFrame.classList.add("pan-ready");
                return;
            }
            
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
                e.preventDefault();
                if (e.shiftKey) redoStroke();
                else undoStroke();
                return;
            }
            
            if (e.key === "Delete" || e.key === "Backspace") {
                if (selectedText) { e.preventDefault(); removeSelectedText(); }
                else if (selectedShapeId) { e.preventDefault(); deleteSelectedShape(); }
                return;
            }
            
            const keyMap = { b: "brush", e: "eraser", h: "hand", l: "line", r: "rect", o: "circle", t: "triangle", s: "shape", g: "fill", i: "eyedropper" };
            const mapped = keyMap[e.key.toLowerCase()];
            if (mapped) setTool(mapped);
        });
        
        window.addEventListener("keyup", (e) => {
            if (e.key === "Shift") shiftPressed = false;
            if (e.code === "Space") {
                spacePressed = false;
                isStudioPanning = false;
                canvasFrame.classList.remove("pan-ready", "panning");
            }
        });
        
        var weatherApplied = false;
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
        
        let texts = [];
        let selectedText = null;
        
        function frameUnit() { return (canvasFrame.clientWidth || 460) / 500; }
        function syncUnit() {
            canvasFrame.style.setProperty("--u", frameUnit() + "px");
            applyStudioTransform();
        }
        if (window.ResizeObserver) new ResizeObserver(syncUnit).observe(canvasFrame);
        window.addEventListener("resize", syncUnit);
        
        function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
        
        function placeText(item) {
            item.el.style.left = (item.x / 5) + "%";
            item.el.style.top = (item.y / 5) + "%";
        }
        
        function selectText(item) {
            texts.forEach(t => t.el.classList.remove("selected"));
            selectedText = item;
            if (item) {
                item.el.classList.add("selected");
                document.getElementById("font-select").value = item.fn || "Inter";
            }
        }
        
        function deselectText() {
            texts.forEach(t => t.el.classList.remove("selected"));
            selectedText = null;
            const ae = document.activeElement;
            if (ae && textLayer.contains(ae)) ae.blur();
        }
        
        function deleteTextItem(item) {
            if (!item) return;
            texts = texts.filter(t => t !== item);
            layers = layers.filter(l => l.textItem !== item);
            item.el.remove();
            if (selectedText === item) selectedText = null;
            renderLayersPanel();
            scheduleDraftSave();
        }
        
        function removeSelectedText() {
            if (selectedText) { deleteTextItem(selectedText); showToast("Removed selected text"); return; }
            showToast("Select a text box first, or delete it from Layers");
        }
        
        function stampTextItem(item) {
            const target = item || selectedText;
            if (!target) {
                showToast("Select a text box first");
                return;
            }
            if (!(target.t || "").trim()) {
                showToast("Type some text first");
                return;
            }
            strokes.push({
                k: "text",
                t: target.t.slice(0, 120),
                x: Math.round(target.x),
                y: Math.round(target.y),
                c: target.c,
                f: target.f,
                fn: target.fn || "Inter"
            });
            redoStack = [];
            deleteTextItem(target);
            redrawStudio();
            updateHistoryUI();
            scheduleDraftSave();
            haptic(10);
            showToast("Stamped onto canvas ✓");
        }
        
        function stampSelectedOrAllText() {
            if (selectedText) {
                stampTextItem(selectedText);
                return;
            }
            if (texts.length === 1) {
                stampTextItem(texts[0]);
                return;
            }
            if (texts.length > 1) {
                showToast("Tap a text box to select it first");
                return;
            }
            showToast("No text to stamp");
        }
        
        function addText(init, skipToolSwitch = false) {
            syncUnit();
            if (!skipToolSwitch) setTool("hand");
            
            const fontKey = (init && init.fn) || defaultTextFont;
            const item = Object.assign({
                id: "t" + Date.now() + Math.random().toString(36).slice(2, 5),
                t: "", x: 130, y: 210, c: currentColor, f: defaultTextFs, fn: fontKey
            }, init || {});
            
            const box = document.createElement("div");
            box.className = "text-box";
            box.style.setProperty("--fs", item.f);
            box.style.setProperty("--ff", FONT_FAMILIES[item.fn] || FONT_FAMILIES["Inter"]);
            box.style.color = item.c;
            
            const handle = document.createElement("button");
            handle.className = "text-handle";
            handle.type = "button";
            handle.textContent = "✥";
            handle.setAttribute("aria-label", "Drag text");
            
            const del = document.createElement("button");
            del.className = "text-del";
            del.type = "button";
            del.textContent = "×";
            del.setAttribute("aria-label", "Delete text");
            
            const stamp = document.createElement("button");
            stamp.className = "text-stamp";
            stamp.type = "button";
            stamp.textContent = "✓";
            stamp.title = "Stamp onto canvas";
            stamp.setAttribute("aria-label", "Stamp text onto canvas");
            
            const content = document.createElement("div");
            content.className = "text-content";
            content.contentEditable = "plaintext-only";
            if (content.contentEditable !== "plaintext-only") content.contentEditable = "true";
            content.spellcheck = false;
            content.textContent = item.t;
            
            box.appendChild(handle);
            box.appendChild(del);
            box.appendChild(stamp);
            box.appendChild(content);
            textLayer.appendChild(box);
            
            item.el = box;
            item.content = content;
            texts.push(item);
            placeText(item);
            
            content.addEventListener("input", () => {
                item.t = (content.innerText || "").replace(/\n+$/, "");
                const lyr = layers.find(l => l.textItem === item);
                if (lyr) lyr.name = item.t.trim() ? `Text: ${item.t.trim().slice(0, 14)}` : "Text Layer";
                renderLayersPanel();
                scheduleDraftSave();
            });
            content.addEventListener("focus", () => selectText(item));
            
            box.addEventListener("pointerdown", (e) => {
                e.stopPropagation();
                selectText(item);
                
                if (currentTool === "hand" && e.target !== del && e.target !== handle && e.target !== stamp) {
                    const u = frameUnit() * studioScale;
                    const sx = e.clientX, sy = e.clientY, ox = item.x, oy = item.y;
                    let moved = false;
                    
                    const move = (ev) => {
                        if (Math.hypot(ev.clientX - sx, ev.clientY - sy) > 4) {
                            moved = true;
                            ev.preventDefault();
                        }
                        if (moved) {
                            item.x = clamp(ox + (ev.clientX - sx) / u, 0, 470);
                            item.y = clamp(oy + (ev.clientY - sy) / u, 0, 480);
                            placeText(item);
                        }
                    };
                    const up = () => {
                        window.removeEventListener("pointermove", move);
                        window.removeEventListener("pointerup", up);
                        if (!moved) content.focus();
                        else scheduleDraftSave();
                    };
                    window.addEventListener("pointermove", move);
                    window.addEventListener("pointerup", up);
                }
            });
            
            del.addEventListener("click", (e) => { e.stopPropagation(); deleteTextItem(item); });
            stamp.addEventListener("click", (e) => { e.stopPropagation(); stampTextItem(item); });
            
            handle.addEventListener("pointerdown", (e) => {
                e.preventDefault();
                e.stopPropagation();
                selectText(item);
                handle.setPointerCapture(e.pointerId);
                const u = frameUnit() * studioScale;
                const sx = e.clientX, sy = e.clientY, ox = item.x, oy = item.y;
                const move = (ev) => {
                    item.x = clamp(ox + (ev.clientX - sx) / u, 0, 470);
                    item.y = clamp(oy + (ev.clientY - sy) / u, 0, 480);
                    placeText(item);
                };
                const up = () => {
                    handle.removeEventListener("pointermove", move);
                    handle.removeEventListener("pointerup", up);
                    handle.removeEventListener("pointercancel", up);
                    scheduleDraftSave();
                };
                handle.addEventListener("pointermove", move);
                handle.addEventListener("pointerup", up);
                handle.addEventListener("pointercancel", up);
            });
            
            const textLayerObj = {
                id: "tlayer_" + item.id,
                name: (item.t || "").trim() ? `Text: ${item.t.trim().slice(0, 14)}` : `Text ${texts.length}`,
                type: "text",
                visible: true,
                opacity: 1,
                textItem: item
            };
            layers.push(textLayerObj);
            if (!skipToolSwitch) activeLayerId = textLayerObj.id;
            syncTextLayerZOrder();
            renderLayersPanel();
            
            selectText(item);
            if (!init) setTimeout(() => content.focus(), 0);
            return item;
        }
        
        function changeTextFont(fontKey) {
            defaultTextFont = fontKey;
            if (selectedText) {
                selectedText.fn = fontKey;
                selectedText.el.style.setProperty("--ff", FONT_FAMILIES[fontKey] || FONT_FAMILIES["Inter"]);
                scheduleDraftSave();
            } else {
                showToast("Font set to " + fontKey);
            }
        }
        
        function changeTextSize(dir) {
            const cur = selectedText ? selectedText.f : defaultTextFs;
            let idx = TEXT_FS.reduce((best, v, i) => Math.abs(v - cur) < Math.abs(TEXT_FS[best] - cur) ? i : best, 0);
            idx = clamp(idx + dir, 0, TEXT_FS.length - 1);
            const f = TEXT_FS[idx];
            if (selectedText) {
                selectedText.f = f;
                selectedText.el.style.setProperty("--fs", f);
                scheduleDraftSave();
            } else {
                defaultTextFs = f;
                showToast("Text size set. Tap Add text.");
            }
        }
        
        function getTextItems() {
            return texts
            .filter(t => (t.t || "").trim().length > 0)
            .map(t => ({
                k: "text",
                t: t.t.slice(0, 120),
                x: Math.round(t.x),
                y: Math.round(t.y),
                c: t.c,
                f: t.f,
                fn: t.fn || "Inter"
            }));
        }
        
        function clearTexts() {
            texts.forEach(t => t.el.remove());
            texts = [];
            selectedText = null;
        }
        
        document.addEventListener("pointerdown", (e) => {
            if (!selectedText) return;
            if (e.target.closest && e.target.closest(".text-box, .sheet, .tool-dock")) return;
            deselectText();
        });
        
        function buildShapePoints(shapeType, p0, p1, constrain = false) {
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
            
            function hexToRgba(hex, alpha = 1) {
                let clean = (hex || "#0f172a").replace("#", "");
                if (clean.length === 3) clean = clean.split("").map(ch => ch + ch).join("");
                const num = parseInt(clean, 16);
                return [(num >> 16) & 255, (num >> 8) & 255, num & 255, Math.round(alpha * 255)];
            }
            
            function rgbToHex(r, g, b) {
                return "#" + [r, g, b].map(v => v.toString(16).padStart(2, "0")).join("");
            }
            
            var refPickMode = "auto";
            function toggleRefPickMode() {
                refPickMode = refPickMode === "auto" ? "ref" : "auto";
                const b = document.getElementById("ref-pick-btn");
                if (b) b.textContent = refPickMode === "ref" ? "Picker: Reference first" : "Picker: Auto";
                scheduleReferenceDraftSave();
                haptic(6);
                showToast(refPickMode === "ref" ? "Picker reads the reference image first" : "Picker reads your drawing, then the reference");
            }
            
            var _refSampler = null;
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
            
            function applyFloodFill(ctx, startX, startY, fillColor, alpha, dim) {
                const sx = clamp(Math.round((startX / 500) * dim), 0, dim - 1);
                const sy = clamp(Math.round((startY / 500) * dim), 0, dim - 1);
                const img = ctx.getImageData(0, 0, dim, dim);
                const buf32 = new Uint32Array(img.data.buffer);
                const [fr, fg, fb, fa] = hexToRgba(fillColor, alpha);
                const fillPacked = ((fa << 24) | (fb << 16) | (fg << 8) | fr) >>> 0;
                
                const startVal = buf32[sy * dim + sx];
                const sr = startVal & 255, sg = (startVal >>> 8) & 255, sb = (startVal >>> 16) & 255, sa = (startVal >>> 24) & 255;
                const tol = 32;
                if (Math.abs(sr - fr) <= 4 && Math.abs(sg - fg) <= 4 && Math.abs(sb - fb) <= 4 && Math.abs(sa - fa) <= 10) return;
                
                const total = dim * dim;
                const visited = new Uint8Array(total);
                const stack = new Int32Array(total * 2);
                let sp = 0;
                stack[sp++] = sx;
                stack[sp++] = sy;
                
                while (sp > 0) {
                    const y = stack[--sp];
                    const x = stack[--sp];
                    const rowOff = y * dim;
                    if (visited[rowOff + x]) continue;
                    
                    let lx = x;
                    while (lx > 0 && !visited[rowOff + lx - 1]) {
                        const v = buf32[rowOff + lx - 1];
                        if (Math.abs((v & 255) - sr) > tol || Math.abs(((v >>> 8) & 255) - sg) > tol || Math.abs(((v >>> 16) & 255) - sb) > tol || Math.abs(((v >>> 24) & 255) - sa) > tol) break;
                        lx--;
                    }
                    let rx = x;
                    while (rx < dim - 1 && !visited[rowOff + rx + 1]) {
                        const v = buf32[rowOff + rx + 1];
                        if (Math.abs((v & 255) - sr) > tol || Math.abs(((v >>> 8) & 255) - sg) > tol || Math.abs(((v >>> 16) & 255) - sb) > tol || Math.abs(((v >>> 24) & 255) - sa) > tol) break;
                        rx++;
                    }
                    
                    for (let cx = lx; cx <= rx; cx++) {
                        const cPos = rowOff + cx;
                        visited[cPos] = 1;
                        buf32[cPos] = fillPacked;
                        
                        if (y > 0) {
                            const uPos = cPos - dim;
                            if (!visited[uPos]) {
                                const uv = buf32[uPos];
                                if (Math.abs((uv & 255) - sr) <= tol && Math.abs(((uv >>> 8) & 255) - sg) <= tol && Math.abs(((uv >>> 16) & 255) - sb) <= tol && Math.abs(((uv >>> 24) & 255) - sa) <= tol) {
                                    stack[sp++] = cx; stack[sp++] = y - 1;
                                }
                            }
                        }
                        if (y < dim - 1) {
                            const dPos = cPos + dim;
                            if (!visited[dPos]) {
                                const dv = buf32[dPos];
                                if (Math.abs((dv & 255) - sr) <= tol && Math.abs(((dv >>> 8) & 255) - sg) <= tol && Math.abs(((dv >>> 16) & 255) - sb) <= tol && Math.abs(((dv >>> 24) & 255) - sa) <= tol) {
                                    stack[sp++] = cx; stack[sp++] = y + 1;
                                }
                            }
                        }
                    }
                }
                ctx.putImageData(img, 0, 0);
            }
            
            function getCanvasPoint(e) {
                const touch = e.touches && e.touches[0] || e.changedTouches && e.changedTouches[0];
                const clientX = touch ? touch.clientX : e.clientX;
                const clientY = touch ? touch.clientY : e.clientY;
                const rect = canvasFrame.getBoundingClientRect();
                const w = canvasFrame.clientWidth || rect.width || 460;
                const h = canvasFrame.clientHeight || rect.height || 460;
                const projectedX = clientX - rect.left - canvasFrame.clientLeft - w / 2 - studioPanX;
                const projectedY = clientY - rect.top - canvasFrame.clientTop - h / 2 - studioPanY;
                const local = inverseStudioVector(projectedX, projectedY, studioScale, studioRotation, studioFlipX);
                const x = Math.round(((local[0] + w / 2) / w) * 500);
                const y = Math.round(((local[1] + h / 2) / h) * 500);
                return [Math.max(0, Math.min(500, x)), Math.max(0, Math.min(500, y))];
            }

            function updateTouchGesture(e) {
                if (!touchGesture || !e.touches) return;
                touchGesture.maxTouches = Math.max(touchGesture.maxTouches, e.touches.length);
                for (const start of touchGesture.starts) {
                    for (let i = 0; i < e.touches.length; i++) {
                        const touch = e.touches[i];
                        if (touch.identifier === start.id &&
                            Math.hypot(touch.clientX - start.x, touch.clientY - start.y) > 10) {
                            touchGesture.moved = true;
                        }
                    }
                }
            }

            function collabRandomHex(byteCount) {
                if (!window.crypto || !window.crypto.getRandomValues) throw new Error("Secure random numbers are unavailable");
                const bytes = new Uint8Array(byteCount);
                window.crypto.getRandomValues(bytes);
                return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
            }

            function collabArtistName() {
                const input = document.getElementById("author-input");
                const name = input && input.value.trim().slice(0, 24);
                return name || ("Artist " + (collabSelfKey || "").slice(-4));
            }

            function renderCollabInviteQR() {
                const wrapper = document.getElementById("collab-qr-card");
                const image = document.getElementById("collab-invite-qr");
                const status = document.getElementById("collab-qr-status");
                const download = document.getElementById("collab-qr-download");
                const invite = document.getElementById("collab-invite-link");
                if (!wrapper || !image || !status || !download || !invite) return;

                const inviteUrl = invite.value;
                if (!collabChannel || !collabIsHost || !collabRoomId || !inviteUrl) {
                    wrapper.hidden = true;
                    wrapper.dataset.inviteUrl = "";
                    image.removeAttribute("src");
                    download.removeAttribute("href");
                    return;
                }

                wrapper.hidden = false;
                if (wrapper.dataset.inviteUrl === inviteUrl) return;
                wrapper.dataset.inviteUrl = inviteUrl;
                status.textContent = "Generating room QR code…";

                try {
                    if (typeof window.qrcode !== "function") throw new Error("The local QR encoder is unavailable.");
                    const qr = window.qrcode(0, "M");
                    qr.addData(inviteUrl);
                    qr.make();
                    const dataUrl = qr.createDataURL(5, 4);
                    image.src = dataUrl;
                    download.href = dataUrl;
                    download.download = "artcher-team-invite-" + collabRoomId.slice(0, 8) + ".gif";
                    status.textContent = "Scan this code to open the invite in ARTcher.";
                } catch (error) {
                    image.removeAttribute("src");
                    download.removeAttribute("href");
                    status.textContent = "QR couldn't be created. Copy the invite link instead.";
                    console.error("Could not generate the local collaboration invite QR code.", error);
                }
            }

            function updateCollabUI(state, message) {
                const status = document.getElementById("collab-status");
                const participants = document.getElementById("collab-participants");
                const startButton = document.getElementById("collab-start-btn");
                const leaveButton = document.getElementById("collab-leave-btn");
                const invite = document.getElementById("collab-invite");
                if (status) {
                    status.dataset.state = state;
                    status.textContent = message;
                }
                if (participants) participants.textContent = collabChannel ? "Connecting artists…" : "Only you";
                if (startButton) startButton.hidden = state === "connected" || state === "connecting" || !!collabChannel;
                if (leaveButton) leaveButton.hidden = !collabChannel;
                if (invite) invite.hidden = !collabChannel;
                renderCollabInviteQR();
            }

            function setCollabRoomInUrl(roomId) {
                const url = new URL(window.location.href);
                const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
                hash.set("collab", roomId);
                url.hash = hash.toString();
                history.replaceState(null, "", url.toString());
                const invite = document.getElementById("collab-invite-link");
                if (invite) invite.value = url.toString();
            }

            function clearCollabRoomFromUrl() {
                const url = new URL(window.location.href);
                const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
                hash.delete("collab");
                url.hash = hash.toString();
                history.replaceState(null, "", url.toString());
            }

            function ensureCollabSharedLayer() {
                if (!collabRoomId) return null;
                collabSharedLayerId = "shared_" + collabRoomId;
                let layer = layers.find(item => item.id === collabSharedLayerId && item.type === "draw");
                if (!layer) {
                    layer = {
                        id: collabSharedLayerId,
                        name: "Shared drawing",
                        type: "draw",
                        visible: true,
                        opacity: 1,
                        alphaLock: false,
                        clipToBelow: false,
                        strokes: [],
                        redoStack: []
                    };
                    layers.push(layer);
                    normalizeLayerClipping();
                }
                activeLayerId = collabSharedLayerId;
                redrawStudio();
                updateHistoryUI();
                renderLayersPanel();
                scheduleDraftSave();
                return layer;
            }

            function collabSend(event, payload) {
                if (!collabChannel || collabChannel.state !== "joined") return Promise.resolve(false);
                return collabChannel.send({ type: "broadcast", event, payload }).then(result => {
                    if (result !== "ok") {
                        console.warn("Collaboration event was not delivered:", event, result);
                        return false;
                    }
                    return true;
                }).catch(error => {
                    console.error("Collaboration event failed:", event, error);
                    return false;
                });
            }

            function collabColor(peerId) {
                let hash = 0;
                for (let i = 0; i < peerId.length; i++) hash = (hash * 31 + peerId.charCodeAt(i)) | 0;
                return ["#2563eb", "#db2777", "#7c3aed", "#0891b2"][Math.abs(hash) % 4];
            }

            function renderCollabCursor(payload) {
                if (!payload || payload.peerId === collabSelfKey || !Number.isFinite(payload.x) || !Number.isFinite(payload.y)) return;
                let cursor = collabCursors.get(payload.peerId);
                if (!cursor) {
                    cursor = document.createElement("div");
                    cursor.className = "collab-cursor";
                    const dot = document.createElement("span");
                    dot.className = "collab-cursor-dot";
                    const label = document.createElement("span");
                    label.className = "collab-cursor-name";
                    cursor.append(dot, label);
                    cursor.style.setProperty("--cursor-color", collabColor(payload.peerId));
                    document.getElementById("collab-cursors").appendChild(cursor);
                    collabCursors.set(payload.peerId, cursor);
                }
                cursor.style.left = (Math.max(0, Math.min(500, payload.x)) / 5) + "%";
                cursor.style.top = (Math.max(0, Math.min(500, payload.y)) / 5) + "%";
                cursor.querySelector(".collab-cursor-name").textContent = String(payload.name || "Artist").slice(0, 24);
                cursor.classList.toggle("drawing", payload.active === true);
            }

            function clearCollabCursor(peerId) {
                const cursor = collabCursors.get(peerId);
                if (cursor) cursor.remove();
                collabCursors.delete(peerId);
            }

            function updateCollabPresenceUI() {
                if (!collabChannel) return;
                const state = collabChannel.presenceState();
                const entries = Object.entries(state).map(([key, values]) => ({
                    key,
                    meta: Array.isArray(values) ? values[0] || {} : values || {}
                }));
                if (!entries.some(entry => entry.key === collabSelfKey)) return;
                const allowed = entries.slice().sort((a, b) => {
                    if (!!a.meta.host !== !!b.meta.host) return a.meta.host ? -1 : 1;
                    return Number(a.meta.joinedAt || 0) - Number(b.meta.joinedAt || 0);
                }).slice(0, 2);
                if (allowed.some(entry => entry.meta.host)) collabHadHost = true;
                if (collabHadHost && !allowed.some(entry => entry.meta.host) && allowed.some(entry => entry.key === collabSelfKey)) {
                    collabIsHost = true;
                    collabChannel.track({
                        name: collabArtistName(),
                        host: true,
                        joinedAt: Date.now(),
                        pointer: collabPointerKnown
                            ? Object.assign({ peerId: collabSelfKey, name: collabArtistName() }, collabLastPointer)
                            : null
                    }).catch(error => console.error("Unable to take over the live drawing room.", error));
                }
                if (!allowed.some(entry => entry.key === collabSelfKey)) {
                    leaveCollaboration(true);
                    showToast("This collaboration room already has two artists");
                    return;
                }
                const current = new Set(allowed.filter(entry => entry.key !== collabSelfKey).map(entry => entry.key));
                for (const peerId of collabCursors.keys()) {
                    if (!current.has(peerId)) clearCollabCursor(peerId);
                }
                allowed.forEach(entry => {
                    if (entry.key === collabSelfKey) return;
                    const pointer = entry.meta.pointer;
                    if (pointer && pointer.known !== false) renderCollabCursor(Object.assign({}, pointer, {
                        peerId: entry.key,
                        name: entry.meta.name || pointer.name
                    }));
                });
                const names = allowed.map(entry => entry.key === collabSelfKey ? "You" : String(entry.meta.name || "Artist"));
                const participants = document.getElementById("collab-participants");
                if (participants) participants.textContent = names.join(" + ") + " · " + names.length + "/2 artists";
            }

            function setLocalCollabPointer(point, active, force = false) {
                if (!collabChannel || !point) return;
                collabPointerKnown = true;
                collabLastPointer = { x: point[0], y: point[1], active: !!active };
                const now = performance.now();
                if (!force && now - collabLastPointerSentAt < 45) {
                    if (!collabPointerTimer) {
                        collabPointerTimer = setTimeout(() => {
                            collabPointerTimer = null;
                            setLocalCollabPointer([collabLastPointer.x, collabLastPointer.y], collabLastPointer.active, true);
                        }, 48);
                    }
                    return;
                }
                collabLastPointerSentAt = now;
                collabSend("pointer", Object.assign({
                    peerId: collabSelfKey,
                    name: collabArtistName()
                }, collabLastPointer));
            }

            function updateLocalCollabPointerFromEvent(event, active) {
                if (!collabChannel || (event.touches && event.touches.length > 1)) return;
                const touch = event.touches && event.touches[0] || event.changedTouches && event.changedTouches[0];
                const x = touch ? touch.clientX : event.clientX;
                const y = touch ? touch.clientY : event.clientY;
                if (typeof x !== "number" || typeof y !== "number") return;
                const rect = canvasFrame.getBoundingClientRect();
                if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
                    if (!active) setLocalCollabPointer([collabLastPointer.x, collabLastPointer.y], false, true);
                    return;
                }
                setLocalCollabPointer(getCanvasPoint(event), active);
            }

            function collabStrokeCopies(items) {
                return items.filter(Boolean).map(item => JSON.parse(JSON.stringify(item)));
            }

            function collabPreviewStrokes(items) {
                return collabStrokeCopies(items).map(stroke => {
                    if (Array.isArray(stroke.p) && stroke.p.length > 1200) {
                        const stride = Math.ceil(stroke.p.length / 1200);
                        stroke.p = stroke.p.filter((point, index) => index % stride === 0 || index === stroke.p.length - 1);
                    }
                    return stroke;
                });
            }

            function tagCollabStrokeGroup(items, groupId) {
                items.forEach((item, index) => {
                    item.__collabGroupId = groupId;
                    item.__collabId = groupId + ":" + index;
                });
            }

            function startCollabStrokePreview(items) {
                if (!collabChannel || !items.length) return;
                collabCurrentStrokeId = collabSelfKey + ":" + (++collabStrokeSequence);
                tagCollabStrokeGroup(items, collabCurrentStrokeId);
                collabSend("stroke-preview", {
                    peerId: collabSelfKey,
                    groupId: collabCurrentStrokeId,
                    strokes: collabPreviewStrokes(items)
                });
            }

            function scheduleCollabStrokePreview() {
                if (!collabChannel || !currentStroke || collabStrokePreviewTimer) return;
                collabStrokePreviewTimer = setTimeout(() => {
                    collabStrokePreviewTimer = null;
                    if (!currentStroke || !collabCurrentStrokeId) return;
                    collabSend("stroke-preview", {
                        peerId: collabSelfKey,
                        groupId: collabCurrentStrokeId,
                        strokes: collabPreviewStrokes([currentStroke].concat(mirrorStrokes))
                    });
                }, 45);
            }

            async function sendCollabChunked(kind, serialized) {
                if (serialized.length > 2000000) {
                    showToast("This drawing update is too large to share live");
                    return false;
                }
                const transferId = collabSelfKey + ":" + kind + ":" + Date.now() + ":" + (++collabStrokeSequence);
                const chunkSize = 60000;
                const count = Math.ceil(serialized.length / chunkSize);
                for (let index = 0; index < count; index++) {
                    const sent = await collabSend("collab-data-chunk", {
                        peerId: collabSelfKey,
                        kind,
                        transferId,
                        index,
                        count,
                        data: serialized.slice(index * chunkSize, (index + 1) * chunkSize)
                    });
                    if (!sent) return false;
                }
                return true;
            }

            function commitCollabStrokeGroup(items) {
                if (!collabChannel || !items.length) return;
                const groupId = items[0].__collabGroupId || collabSelfKey + ":" + (++collabStrokeSequence);
                if (!items.every(item => item.__collabId)) tagCollabStrokeGroup(items, groupId);
                const payload = {
                    peerId: collabSelfKey,
                    groupId,
                    strokes: collabStrokeCopies(items)
                };
                const serialized = JSON.stringify(payload);
                if (serialized.length <= 100000) collabSend("stroke-commit", payload);
                else sendCollabChunked("stroke-commit", serialized);
                collabCurrentStrokeId = null;
                collabRemotePreview = [];
                collabRemotePreviewGroupId = null;
                clearTimeout(collabStrokePreviewTimer);
                collabStrokePreviewTimer = null;
                collabPreviewCtx.clearRect(0, 0, 500, 500);
            }

            function applyCollabStrokeCommit(payload) {
                if (!collabChannel || !payload || payload.peerId === collabSelfKey || !Array.isArray(payload.strokes) || payload.strokes.length > 100) return;
                const layer = layers.find(item => item.id === collabSharedLayerId && item.type === "draw");
                if (!layer) {
                    if (!collabSyncReady && collabPendingStrokeCommits.length < 100) {
                        collabPendingStrokeCommits.push(JSON.parse(JSON.stringify(payload)));
                    }
                    return;
                }
                for (const stroke of payload.strokes) {
                    if (!stroke || typeof stroke !== "object") continue;
                    if (stroke.k === "fill") {
                        if (!Number.isFinite(stroke.x) || !Number.isFinite(stroke.y)) continue;
                    } else if (!Array.isArray(stroke.p) || stroke.p.length > 10000) continue;
                    const id = typeof stroke.__collabId === "string" ? stroke.__collabId : payload.groupId + ":" + layer.strokes.length;
                    const copy = JSON.parse(JSON.stringify(stroke));
                    copy.__collabId = id;
                    copy.__collabGroupId = payload.groupId;
                    const existingIndex = layer.strokes.findIndex(item => item.__collabId === id);
                    if (existingIndex >= 0) layer.strokes[existingIndex] = copy;
                    else if (!collabSeenStrokeIds.has(id)) layer.strokes.push(copy);
                    collabSeenStrokeIds.add(id);
                }
                if (payload.groupId) {
                    collabRemotePreview = [];
                    collabRemotePreviewGroupId = null;
                    collabPreviewCtx.clearRect(0, 0, 500, 500);
                }
                redrawStudio();
                updateHistoryUI();
                renderLayersPanel();
                scheduleDraftSave();
            }

            function drawRemoteCollabPreview(payload) {
                if (!collabChannel || !payload || payload.peerId === collabSelfKey || !Array.isArray(payload.strokes)) return;
                collabRemotePreviewGroupId = payload.groupId || null;
                collabRemotePreview = payload.strokes.slice(0, 100);
                renderStrokesInstant(collabPreviewCtx, collabRemotePreview, 500, true);
            }

            function sendCollabSnapshot() {
                if (!collabChannel || !collabIsHost) return;
                const serialized = JSON.stringify(serializeStudioDraft());
                sendCollabChunked("snapshot", serialized);
            }

            function receiveCollabSnapshotChunk(payload) {
                if (!payload || payload.peerId === collabSelfKey ||
                    !["snapshot", "stroke-commit"].includes(payload.kind) ||
                    typeof payload.transferId !== "string" || !Number.isInteger(payload.index) ||
                    !Number.isInteger(payload.count) || payload.count < 1 || payload.count > 34 ||
                    payload.index < 0 || payload.index >= payload.count ||
                    typeof payload.data !== "string" || payload.data.length > 60000) return;
                let transfer = collabSnapshotTransfers.get(payload.transferId);
                if (!transfer) {
                    transfer = { kind: payload.kind, count: payload.count, chunks: new Array(payload.count), size: 0, timer: null };
                    transfer.timer = setTimeout(() => collabSnapshotTransfers.delete(payload.transferId), 30000);
                    collabSnapshotTransfers.set(payload.transferId, transfer);
                }
                if (transfer.kind !== payload.kind || transfer.count !== payload.count || transfer.chunks[payload.index]) return;
                transfer.chunks[payload.index] = payload.data;
                transfer.size += payload.data.length;
                if (transfer.size > 2000000) {
                    clearTimeout(transfer.timer);
                    collabSnapshotTransfers.delete(payload.transferId);
                    return;
                }
                if (transfer.chunks.every(Boolean)) {
                    clearTimeout(transfer.timer);
                    collabSnapshotTransfers.delete(payload.transferId);
                    try {
                        const data = JSON.parse(transfer.chunks.join(""));
                        if (payload.kind === "stroke-commit") {
                            applyCollabStrokeCommit(data);
                            return;
                        }
                        if (collabIsHost || !data || !Array.isArray(data.layers) || data.layers.length > 100) return;
                        loadDraft(data);
                        ensureCollabSharedLayer();
                        const sharedLayer = layers.find(item => item.id === collabSharedLayerId);
                        if (sharedLayer) {
                            sharedLayer.strokes.forEach(stroke => {
                                if (stroke.__collabId) collabSeenStrokeIds.add(stroke.__collabId);
                            });
                        }
                        collabSyncReady = true;
                        clearTimeout(collabSyncTimer);
                        collabSyncTimer = null;
                        updateCollabUI("connected", "Connected · live drawing");
                        while (collabPendingStrokeCommits.length) {
                            applyCollabStrokeCommit(collabPendingStrokeCommits.shift());
                        }
                        scheduleDraftSave();
                        showToast("Shared drawing loaded");
                    } catch (error) {
                        console.error("Unable to load the shared drawing snapshot.", error);
                        showToast("The shared drawing couldn't be loaded");
                    }
                }
            }

            function receiveCollabStrokeRemoval(payload) {
                if (!payload || payload.peerId === collabSelfKey || typeof payload.strokeId !== "string") return;
                const layer = layers.find(item => item.id === collabSharedLayerId && item.type === "draw");
                if (!layer) return;
                const index = layer.strokes.findIndex(stroke => stroke.__collabId === payload.strokeId);
                if (index < 0) return;
                layer.strokes.splice(index, 1);
                collabSeenStrokeIds.delete(payload.strokeId);
                redrawStudio();
                updateHistoryUI();
                renderLayersPanel();
                scheduleDraftSave();
            }

            function clearRemoteCollabLayer(payload) {
                if (!payload || payload.peerId === collabSelfKey) return;
                const layer = layers.find(item => item.id === collabSharedLayerId && item.type === "draw");
                if (!layer) return;
                isDrawing = false;
                currentStroke = null;
                stabilizerPoint = null;
                mirrorStrokes = [];
                shapeStart = null;
                previewCtx.clearRect(0, 0, 500, 500);
                layer.strokes = [];
                layer.redoStack = [];
                collabSeenStrokeIds.clear();
                redrawStudio();
                updateHistoryUI();
                renderLayersPanel();
                scheduleDraftSave();
            }

            function startCollabRoom(roomId, isHost) {
                if (collabChannel) {
                    showToast("Leave the current room before starting another");
                    return false;
                }
                if (!window.sbClient || !window.sbClient.channel) {
                    showToast("Live collaboration isn't available right now");
                    return false;
                }
                collabRoomId = roomId;
                collabIsHost = isHost;
                collabHadHost = isHost;
                collabSyncReady = isHost;
                try {
                    collabSelfKey = collabRandomHex(8);
                } catch (error) {
                    collabRoomId = null;
                    showToast(error.message || "Couldn't create a secure invite");
                    return false;
                }
                if (isHost) ensureCollabSharedLayer();
                setCollabRoomInUrl(roomId);
                updateCollabUI("connecting", "Connecting to shared room…");
                try {
                    collabChannel = window.sbClient.channel("freedomwall-drawing-" + roomId, {
                        config: {
                            broadcast: { self: false },
                            presence: { key: collabSelfKey }
                        }
                    });
                } catch (error) {
                    console.error("Unable to create the Supabase collaboration channel.", error);
                    collabChannel = null;
                    clearCollabRoomFromUrl();
                    updateCollabUI("error", "Couldn't create the shared room");
                    showToast("Couldn't create the shared room");
                    return false;
                }
                renderCollabInviteQR();
                collabChannel
                    .on("presence", { event: "sync" }, updateCollabPresenceUI)
                    .on("broadcast", { event: "pointer" }, ({ payload }) => renderCollabCursor(payload))
                    .on("broadcast", { event: "pointer-request" }, () => {
                        if (collabChannel && collabPointerKnown) collabSend("pointer", Object.assign({
                            peerId: collabSelfKey,
                            name: collabArtistName()
                        }, collabLastPointer));
                    })
                    .on("broadcast", { event: "stroke-preview" }, ({ payload }) => drawRemoteCollabPreview(payload))
                    .on("broadcast", { event: "stroke-commit" }, ({ payload }) => applyCollabStrokeCommit(payload))
                    .on("broadcast", { event: "stroke-remove" }, ({ payload }) => receiveCollabStrokeRemoval(payload))
                    .on("broadcast", { event: "clear-shared" }, ({ payload }) => clearRemoteCollabLayer(payload))
                    .on("broadcast", { event: "stroke-cancel" }, ({ payload }) => {
                        if (payload && payload.peerId !== collabSelfKey && payload.groupId === collabRemotePreviewGroupId) {
                            collabRemotePreview = [];
                            collabRemotePreviewGroupId = null;
                            collabPreviewCtx.clearRect(0, 0, 500, 500);
                        }
                    })
                    .on("broadcast", { event: "snapshot-request" }, () => sendCollabSnapshot())
                    .on("broadcast", { event: "collab-data-chunk" }, ({ payload }) => receiveCollabSnapshotChunk(payload))
                    .subscribe(async status => {
                        if (status === "SUBSCRIBED") {
                            try {
                                await collabChannel.track({
                                    name: collabArtistName(),
                                    host: collabIsHost,
                                    joinedAt: Date.now(),
                                    pointer: collabPointerKnown
                                        ? Object.assign({ peerId: collabSelfKey, name: collabArtistName() }, collabLastPointer)
                                        : null
                                });
                            } catch (error) {
                                console.error("Unable to join the Supabase collaboration channel.", error);
                                updateCollabUI("error", "Couldn't join the shared room");
                                showToast("Couldn't join the shared room");
                                return;
                            }
                            updateCollabUI("connected", "Connected · live drawing");
                            if (!collabIsHost) updateCollabUI("connecting", "Syncing shared drawing…");
                            if (!collabIsHost) {
                                setTimeout(() => {
                                    if (collabChannel) collabSend("snapshot-request", { peerId: collabSelfKey });
                                }, 300);
                                collabSyncTimer = setTimeout(() => {
                                    if (collabChannel && !collabSyncReady) {
                                        showToast("The host's drawing could not be synced");
                                        leaveCollaboration(true);
                                    }
                                }, 15000);
                                setTimeout(() => {
                                    if (!collabChannel || collabIsHost) return;
                                    const present = Object.values(collabChannel.presenceState()).some(values =>
                                        (Array.isArray(values) ? values : [values]).some(meta => meta && meta.host)
                                    );
                                    if (!present) {
                                        showToast("This invite room is no longer active");
                                        leaveCollaboration(true);
                                    }
                                }, 3000);
                                collabSend("pointer-request", { peerId: collabSelfKey });
                            }
                            updateCollabPresenceUI();
                        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
                            updateCollabUI("error", "Couldn't connect to the shared room");
                        } else if (status === "CLOSED" && collabChannel) {
                            updateCollabUI("error", "Connection to the shared room closed");
                        }
                    });
                return true;
            }

            function startCollaboration() {
                let roomId;
                try {
                    roomId = collabRandomHex(16);
                } catch (error) {
                    showToast(error.message || "Couldn't create a secure invite");
                    return;
                }
                if (startCollabRoom(roomId, true)) {
                    showToast("Shared room started · copy the invite link for one artist");
                }
            }

            function initializeCollaborationFromInvite() {
                const roomId = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("collab");
                if (!roomId) return;
                switchView("draw");
                setDrawTab("team");
                if (!/^[a-f0-9]{32}$/i.test(roomId)) {
                    showToast("This collaboration invite link is invalid");
                    return;
                }
                const hasDrawing = getAllFlattenedStrokes(true).length > 0;
                const join = () => startCollabRoom(roomId, false);
                if (hasDrawing) {
                    confirmCriticalAction(
                        "Join shared drawing?",
                        "Joining loads the host's shared drawing into your active draft.",
                        join
                    );
                } else {
                    join();
                }
            }

            async function copyCollabInvite() {
                const input = document.getElementById("collab-invite-link");
                if (!input || !input.value) return;
                try {
                    await navigator.clipboard.writeText(input.value);
                    showToast("Invite link copied");
                } catch (error) {
                    input.focus();
                    input.select();
                    if (document.execCommand("copy")) showToast("Invite link copied");
                    else showToast("Select and copy the invite link");
                }
            }

            async function leaveCollaboration(silent = false) {
                const channel = collabChannel;
                collabChannel = null;
                collabRoomId = null;
                collabSelfKey = null;
                collabIsHost = false;
                collabHadHost = false;
                collabSyncReady = false;
                collabSharedLayerId = null;
                collabCurrentStrokeId = null;
                collabPointerKnown = false;
                clearTimeout(collabPointerTimer);
                clearTimeout(collabStrokePreviewTimer);
                clearTimeout(collabSyncTimer);
                collabPointerTimer = null;
                collabStrokePreviewTimer = null;
                collabSyncTimer = null;
                for (const transfer of collabSnapshotTransfers.values()) clearTimeout(transfer.timer);
                collabSnapshotTransfers.clear();
                collabPendingStrokeCommits.length = 0;
                collabSeenStrokeIds.clear();
                collabCursors.forEach(cursor => cursor.remove());
                collabCursors.clear();
                collabRemotePreview = [];
                collabRemotePreviewGroupId = null;
                collabPreviewCtx.clearRect(0, 0, 500, 500);
                if (channel && window.sbClient) {
                    try {
                        await channel.untrack();
                        await window.sbClient.removeChannel(channel);
                    } catch (error) {
                        console.error("Unable to leave the collaboration room cleanly.", error);
                    }
                }
                clearCollabRoomFromUrl();
                updateCollabUI("offline", "Not collaborating");
                if (!silent) showToast("You left the shared room");
            }

            Object.assign(window, { startCollaboration, leaveCollaboration, copyCollabInvite });
            
            function startDraw(e) {
                if (isPreviewing) return;
                if (collabChannel && !collabSyncReady) {
                    if (performance.now() - collabSyncToastAt > 1500) {
                        collabSyncToastAt = performance.now();
                        showToast("Syncing the shared drawing…");
                    }
                    return;
                }
                
                if (e.touches && e.touches.length >= 2) {
                    e.preventDefault();
                    if (!touchGesture) {
                        touchGesture = {
                            startedAt: performance.now(),
                            maxTouches: e.touches.length,
                            moved: false,
                            starts: Array.from(e.touches, t => ({ id: t.identifier, x: t.clientX, y: t.clientY }))
                        };
                    } else {
                        touchGesture.maxTouches = Math.max(touchGesture.maxTouches, e.touches.length);
                        e.touches.forEach(t => {
                            if (!touchGesture.starts.some(s => s.id === t.identifier)) touchGesture.starts.push({ id: t.identifier, x: t.clientX, y: t.clientY });
                        });
                    }
                    updateTouchGesture(e);
                    if (isDrawing && currentStroke) {
                        if (collabChannel && collabCurrentStrokeId) {
                            collabSend("stroke-cancel", { peerId: collabSelfKey, groupId: collabCurrentStrokeId });
                            setLocalCollabPointer([collabLastPointer.x, collabLastPointer.y], false, true);
                            clearTimeout(collabStrokePreviewTimer);
                            collabStrokePreviewTimer = null;
                            collabCurrentStrokeId = null;
                        }
                        strokes.splice(-1 - mirrorStrokes.length, 1 + mirrorStrokes.length);
                        redrawStudio();
                        updateHistoryUI();
                    }
                    isDrawing = false;
                    currentStroke = null;
                    stabilizerPoint = null;
                    strokePointsSinceSave = 0;
                    mirrorStrokes = [];
                    shapeStart = null;
                    previewCtx.clearRect(0, 0, 500, 500);
                    
                    const rect = canvasFrame.getBoundingClientRect();
                    studioPinchDist = Math.hypot(
                        e.touches[0].clientX - e.touches[1].clientX,
                        e.touches[0].clientY - e.touches[1].clientY
                    );
                    studioPinchMidX = ((e.touches[0].clientX + e.touches[1].clientX) / 2) - rect.left - canvasFrame.clientLeft;
                    studioPinchMidY = ((e.touches[0].clientY + e.touches[1].clientY) / 2) - rect.top - canvasFrame.clientTop;
                    studioPinchAngle = Math.atan2(
                        e.touches[1].clientY - e.touches[0].clientY,
                        e.touches[1].clientX - e.touches[0].clientX
                    );
                    return;
                }
                
                const clientX = e.touches ? e.touches[0].clientX : e.clientX;
                const clientY = e.touches ? e.touches[0].clientY : e.clientY;
                
                if (currentTool === "hand" || (!e.touches && (spacePressed || e.button === 1))) {
                    e.preventDefault();
                    deselectText();
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
                updateLocalCollabPointerFromEvent(e, true);
                if (collabChannel && collabSharedLayerId) activeLayerId = collabSharedLayerId;
                
                if (!isShapeTool(currentTool)) selectShape(null);
                if (currentTool === "eyedropper") { pickColorAt(pt); return; }
                
                if (currentTool === "fill") {
                    redoStack = [];
                    rememberUsedColor(currentColor);
                    const fillStroke = { k: "fill", c: currentColor, a: currentOpacity, al: !!getActiveDrawLayer().alphaLock, x: pt[0], y: pt[1] };
                    strokes.push(fillStroke);
                    commitCollabStrokeGroup([fillStroke]);
                    setLocalCollabPointer(pt, false, true);
                    haptic(12);
                    redrawStudio();
                    updateHistoryUI();
                    scheduleDraftSave();
                    return;
                }
                
                if (isShapeTool(currentTool)) {
                    isDrawing = true;
                    shapeStart = pt;
                    return;
                }
                
                isDrawing = true;
                redoStack = [];
                const isEraser = currentTool === "eraser";
                if (!isEraser) rememberUsedColor(currentColor);
                
                const symPts = getSymmetricPoints(pt);
                const activeLayer = getActiveDrawLayer();
                currentStroke = {
                    c: isEraser ? "#ffffff" : currentColor,
                    s: currentSize,
                    a: isEraser ? 1 : currentOpacity,
                    er: isEraser,
                    sm: !isEraser && smoothStrokes,
                    kind: isEraser ? "pen" : currentBrushKind,
                    al: !isEraser && !!activeLayer.alphaLock,
                    p: [symPts[0]]
                };
                stabilizerPoint = pt;
                strokePointsSinceSave = 0;
                strokes.push(currentStroke); haptic(4);
                
                mirrorStrokes = [];
                for (let i = 1; i < symPts.length; i++) {
                    const ms = {
                        c: currentStroke.c,
                        s: currentStroke.s,
                        a: currentStroke.a,
                        er: currentStroke.er,
                        sm: currentStroke.sm,
                        kind: currentStroke.kind,
                        al: currentStroke.al,
                        p: [symPts[i]]
                    };
                    mirrorStrokes.push(ms);
                    strokes.push(ms);
                }
                startCollabStrokePreview([currentStroke].concat(mirrorStrokes));
                
                redrawStudio();
                updateHistoryUI();
            }
            
            function moveDraw(e) {
                if (e.touches && e.touches.length >= 2 && studioPinchDist) {
                    e.preventDefault();
                    updateTouchGesture(e);
                    const rect = canvasFrame.getBoundingClientRect();
                    const newDist = Math.hypot(
                        e.touches[0].clientX - e.touches[1].clientX,
                        e.touches[0].clientY - e.touches[1].clientY
                    );
                    const newMidX = ((e.touches[0].clientX + e.touches[1].clientX) / 2) - rect.left - canvasFrame.clientLeft;
                    const newMidY = ((e.touches[0].clientY + e.touches[1].clientY) / 2) - rect.top - canvasFrame.clientTop;
                    
                    studioPanX += (newMidX - studioPinchMidX);
                    studioPanY += (newMidY - studioPinchMidY);
                    
                    const factor = newDist / studioPinchDist;
                    zoomStudioAt(studioScale * factor, newMidX, newMidY);
                    const angle = Math.atan2(
                        e.touches[1].clientY - e.touches[0].clientY,
                        e.touches[1].clientX - e.touches[0].clientX
                    );
                    let angleDelta = angle - studioPinchAngle;
                    while (angleDelta > Math.PI) angleDelta -= Math.PI * 2;
                    while (angleDelta < -Math.PI) angleDelta += Math.PI * 2;
                    if (Math.abs(angleDelta) > 0.005) {
                        if (touchGesture && Math.abs(angleDelta) > 0.035) touchGesture.moved = true;
                        rotateStudioAt(studioRotation + angleDelta * 180 / Math.PI, newMidX, newMidY);
                    }
                    
                    studioPinchDist = newDist;
                    studioPinchMidX = newMidX;
                    studioPinchMidY = newMidY;
                    studioPinchAngle = angle;
                    return;
                }
                
                if (isStudioPanning) {
                    e.preventDefault();
                    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
                    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
                    studioPanX = clientX - studioPanStartX;
                    studioPanY = clientY - studioPanStartY;
                    applyStudioTransform();
                    return;
                }

                updateLocalCollabPointerFromEvent(e, !!isDrawing);
                
                if (!isDrawing || isPreviewing) return;
                e.preventDefault();
                const inputPt = getCanvasPoint(e);
                
                if (shapeStart && (isShapeTool(currentTool))) {
                    const pts = buildShapePoints(currentTool, shapeStart, inputPt, shiftPressed || shapeLock);
                    const isFilled = shapeFilled && isShapeTool(currentTool) && currentTool !== "line";
                    renderStrokesInstant(previewCtx, [{ c: currentColor, s: currentSize, a: currentOpacity, sm: false, kind: currentBrushKind, fl: isFilled, p: pts }], 500, true);
                    return;
                }
                
                if (!currentStroke) return;
                const smoothing = brushStabilizer / 100;
                const lastDrawn = stabilizerPoint || currentStroke.p[currentStroke.p.length - 1];
                const pt = smoothing
                    ? [lastDrawn[0] + (inputPt[0] - lastDrawn[0]) * (1 - smoothing * 0.9), lastDrawn[1] + (inputPt[1] - lastDrawn[1]) * (1 - smoothing * 0.9)]
                    : inputPt;
                const last = currentStroke.p[currentStroke.p.length - 1];
                const minStep = studioScale > 1.5 ? 1 : 2;
                if (Math.hypot(pt[0] - last[0], pt[1] - last[1]) >= minStep) {
                    const symPts = getSymmetricPoints(pt);
                    currentStroke.p.push(symPts[0]);
                    for (let i = 0; i < mirrorStrokes.length; i++) {
                        if (symPts[i + 1]) mirrorStrokes[i].p.push(symPts[i + 1]);
                    }
                    stabilizerPoint = pt;
                    scheduleCollabStrokePreview();
                    strokePointsSinceSave++;
                    scheduleStudioRedraw();
                    if (strokePointsSinceSave >= 24) {
                        strokePointsSinceSave = 0;
                        scheduleDraftSave();
                    }
                }
            }
            
            function endDraw(e) {
                updateLocalCollabPointerFromEvent(e, false);
                if (e && e.touches && e.touches.length < 2) studioPinchDist = null;
                if (e && e.touches) updateTouchGesture(e);
                if (isStudioPanning) {
                    isStudioPanning = false;
                    canvasFrame.classList.remove("panning");
                }

                if (touchGesture && e && e.touches && e.touches.length === 0) {
                    const gesture = touchGesture;
                    touchGesture = null;
                    if (!gesture.moved && performance.now() - gesture.startedAt <= 400) {
                        if (gesture.maxTouches >= 3) redoStroke();
                        else if (gesture.maxTouches === 2) undoStroke();
                    }
                }
                
                if (isDrawing && shapeStart && (isShapeTool(currentTool))) {
                    previewCtx.clearRect(0, 0, 500, 500);
                    const pt = e && getCanvasPoint(e);
                    
                    rememberUsedColor(currentColor);
                    const shapeLayer = getActiveDrawLayer();
                    const shapeCount = shapeLayer.strokes.length;
                    createShape(currentTool, shapeStart, pt || shapeStart, shiftPressed || shapeLock); haptic(8);
                    if (shapeLayer.strokes.length > shapeCount) {
                        commitCollabStrokeGroup([shapeLayer.strokes[shapeLayer.strokes.length - 1]]);
                    }
                    shapeStart = null;
                    isDrawing = false;
                    redrawStudio();
                    updateHistoryUI();
                    scheduleDraftSave();
                    return;
                }
                
                if (!isDrawing) return;
                if (currentStroke && stabilizerPoint) {
                    const endpoint = getCanvasPoint(e);
                    if (Math.hypot(endpoint[0] - stabilizerPoint[0], endpoint[1] - stabilizerPoint[1]) > 1) {
                        const points = getSymmetricPoints(endpoint);
                        currentStroke.p.push(points[0]);
                        for (let i = 0; i < mirrorStrokes.length; i++) {
                            if (points[i + 1]) mirrorStrokes[i].p.push(points[i + 1]);
                        }
                    }
                }
                const finishedStrokes = currentStroke ? [currentStroke].concat(mirrorStrokes) : [];
                if (finishedStrokes.length) commitCollabStrokeGroup(finishedStrokes);
                isDrawing = false;
                currentStroke = null;
                stabilizerPoint = null;
                strokePointsSinceSave = 0;
                mirrorStrokes = [];
                shapeStart = null;
                committedCount = -1; haptic(5);
                redrawStudio();
                updateHistoryUI();
                scheduleDraftSave();
            }
            
            function updateHistoryUI() {
                const strokeTxt = strokes.length + (strokes.length === 1 ? " stroke" : " strokes");
                const statsEl = document.getElementById("studio-stats");
                if (statsEl) statsEl.textContent = `${strokeTxt} · ${wallEntries.length} on wall`;
                document.getElementById("undo-btn").disabled = strokes.length === 0;
                document.getElementById("redo-btn").disabled = redoStack.length === 0;
                onHistoryChanged();
            }
            
            drawCanvas.addEventListener("mousedown", startDraw);
            window.addEventListener("mousemove", moveDraw);
            window.addEventListener("mouseup", endDraw);
            
            canvasFrame.addEventListener("touchstart", startDraw, { passive: false });
            window.addEventListener("touchmove", moveDraw, { passive: false });
            window.addEventListener("touchend", endDraw);
            window.addEventListener("touchcancel", e => {
                touchGesture = null;
                studioPinchDist = null;
                endDraw(e);
            });
            
            function drawTextItem(ctx, it, ratio) {
                const f = it.f || 30;
                const family = FONT_FAMILIES[it.fn] || FONT_FAMILIES["Inter"];
                ctx.save();
                ctx.globalCompositeOperation = "source-over";
                ctx.globalAlpha = 1;
                ctx.font = `700 ${f * ratio}px ${family}`;
                ctx.fillStyle = it.c || "#0f172a";
                ctx.textBaseline = "top";
                ctx.textAlign = "left";
                String(it.t || "").split("\n").forEach((line, i) => {
                    ctx.fillText(line, it.x * ratio, (it.y + (i * 1.2 + 0.1) * f) * ratio);
                });
                ctx.restore();
            }
            
            let alphaClipCanvas = null;
            let alphaClipCtx = null;
            let alphaMaskCanvas = null;
            let alphaMaskCtx = null;
            function ensureAlphaClipCanvas(dim) {
                if (!alphaClipCanvas) {
                    alphaClipCanvas = document.createElement("canvas");
                    alphaClipCtx = alphaClipCanvas.getContext("2d", { willReadFrequently: true });
                }
                if (!alphaMaskCanvas) {
                    alphaMaskCanvas = document.createElement("canvas");
                    alphaMaskCtx = alphaMaskCanvas.getContext("2d");
                }
                if (alphaClipCanvas.width !== dim || alphaClipCanvas.height !== dim) {
                    alphaClipCanvas.width = dim;
                    alphaClipCanvas.height = dim;
                    alphaMaskCanvas.width = dim;
                    alphaMaskCanvas.height = dim;
                }
            }

            function drawBrushStroke(ctx, st, ratio) {
                const kind = st.kind || "pen";
                const size = st.s || 4;
                const points = st.p;
                ctx.lineCap = kind === "marker" || kind === "pixel" ? "square" : "round";
                ctx.lineJoin = ctx.lineCap;
                ctx.lineWidth = size * ratio * (kind === "marker" ? 1.4 : kind === "highlighter" ? 2.4 : 1);
                if (kind === "highlighter") ctx.globalAlpha *= 0.3;
                if (kind === "marker") ctx.globalAlpha *= 0.75;
                if (kind === "dashed") ctx.setLineDash([size * ratio * 2, size * ratio * 1.4]);
                if (kind === "spray") {
                    const radius = Math.max(2, size * 1.5) * ratio;
                    const spacing = Math.max(2, size * 0.65);
                    const segmentCount = Math.max(1, points.length - 1);
                    const dot = (x, y, seed) => {
                        for (let j = 0; j < 8; j++) {
                            const n = seed * 31 + j * 17;
                            const randA = (Math.sin(n * 12.9898) * 43758.5453) % 1;
                            const randR = (Math.sin(n * 78.233 + 4.1) * 19341.357) % 1;
                            const angle = Math.abs(randA) * Math.PI * 2;
                            const distance = Math.sqrt(Math.abs(randR)) * radius;
                            const dotSize = Math.max(0.55, size * 0.08) * ratio;
                            ctx.beginPath();
                            ctx.arc((x + Math.cos(angle) * distance) * ratio, (y + Math.sin(angle) * distance) * ratio, dotSize, 0, Math.PI * 2);
                            ctx.fill();
                        }
                    };
                    if (points.length === 1) {
                        dot(points[0][0], points[0][1], Math.round(points[0][0] * 11 + points[0][1] * 7));
                    } else {
                        let seed = 0;
                        for (let i = 0; i < segmentCount; i++) {
                            const a = points[i], b = points[i + 1];
                            const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
                            const steps = Math.max(1, Math.ceil(length / spacing));
                            for (let step = 0; step <= steps; step++) {
                                const t = step / steps;
                                dot(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, seed++);
                            }
                        }
                    }
                    return;
                }
                if (points.length === 1) {
                    const radius = ((kind === "marker" ? size * 1.4 : kind === "highlighter" ? size * 2.4 : size) * ratio) / 2;
                    if (kind === "pixel") ctx.fillRect(points[0][0] * ratio - radius, points[0][1] * ratio - radius, radius * 2, radius * 2);
                    else {
                        ctx.beginPath();
                        ctx.arc(points[0][0] * ratio, points[0][1] * ratio, radius, 0, Math.PI * 2);
                        ctx.fill();
                    }
                } else {
                    ctx.beginPath();
                    ctx.moveTo(points[0][0] * ratio, points[0][1] * ratio);
                    if (st.sm !== false && points.length > 2) {
                        for (let i = 1; i < points.length - 1; i++) {
                            const xc = ((points[i][0] + points[i + 1][0]) / 2) * ratio;
                            const yc = ((points[i][1] + points[i + 1][1]) / 2) * ratio;
                            ctx.quadraticCurveTo(points[i][0] * ratio, points[i][1] * ratio, xc, yc);
                        }
                        const last = points[points.length - 1];
                        ctx.lineTo(last[0] * ratio, last[1] * ratio);
                    } else {
                        for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0] * ratio, points[i][1] * ratio);
                    }
                    if (st.fl) {
                        ctx.closePath();
                        ctx.fill();
                    }
                    ctx.stroke();
                }
            }

            function renderStrokesInstant(ctx, strokeList, canvasDim, clear = true) {
                if (clear) ctx.clearRect(0, 0, canvasDim, canvasDim);
                const ratio = canvasDim / 500;
                ctx.lineCap = "round";
                ctx.lineJoin = "round";
                
                for (const st of strokeList) {
                    if (st.hidden) continue;
                    if (st.k === "text") { drawTextItem(ctx, st, ratio); continue; }
                    if (st.k === "fill") {
                        if (st.al) {
                            ensureAlphaClipCanvas(canvasDim);
                            ctx.save();
                            alphaMaskCtx.clearRect(0, 0, canvasDim, canvasDim);
                            alphaMaskCtx.drawImage(ctx.canvas, 0, 0);
                            applyFloodFill(ctx, st.x, st.y, st.c || "#0f172a", st.a ?? 1, canvasDim);
                            ctx.globalCompositeOperation = "destination-in";
                            ctx.globalAlpha = 1;
                            ctx.drawImage(alphaMaskCanvas, 0, 0);
                            ctx.restore();
                        } else {
                            applyFloodFill(ctx, st.x, st.y, st.c || "#0f172a", st.a ?? 1, canvasDim);
                        }
                        continue;
                    }
                    if (!st.p || st.p.length === 0) continue;

                    if (st.al && !st.er) {
                        ensureAlphaClipCanvas(canvasDim);
                        alphaClipCtx.clearRect(0, 0, canvasDim, canvasDim);
                        renderStrokesInstant(alphaClipCtx, [Object.assign({}, st, { al: false })], canvasDim, false);
                        alphaClipCtx.globalCompositeOperation = "destination-in";
                        alphaClipCtx.drawImage(ctx.canvas, 0, 0);
                        ctx.save();
                        ctx.globalCompositeOperation = "source-over";
                        ctx.globalAlpha = 1;
                        ctx.drawImage(alphaClipCanvas, 0, 0);
                        ctx.restore();
                        alphaClipCtx.globalCompositeOperation = "source-over";
                        continue;
                    }
                    
                    ctx.save();
                    if (st.er) {
                        ctx.globalCompositeOperation = "destination-out";
                        ctx.globalAlpha = 1;
                        ctx.strokeStyle = "rgba(0,0,0,1)";
                        ctx.fillStyle = "rgba(0,0,0,1)";
                    } else {
                        ctx.globalCompositeOperation = "source-over";
                        ctx.globalAlpha = st.a ?? 1;
                        ctx.strokeStyle = st.c || "#0f172a";
                        ctx.fillStyle = st.c || "#0f172a";
                    }
                    drawBrushStroke(ctx, st, ratio);
                    ctx.restore();
                }
            }
            
            const committedCanvas = document.createElement("canvas");
            committedCanvas.width = 500;
            committedCanvas.height = 500;
            const committedCtx = committedCanvas.getContext("2d", { willReadFrequently: true });
            let committedCount = -1;
            let studioDrawRaf = 0;
            
            const layerScratchCanvas = document.createElement("canvas");
            layerScratchCanvas.width = 500;
            layerScratchCanvas.height = 500;
            const layerScratchCtx = layerScratchCanvas.getContext("2d", { willReadFrequently: true });
            
            function syncTextLayerZOrder() {
                layers.forEach((lyr, idx) => {
                    if (lyr.type === "text" && lyr.textItem && lyr.textItem.el) {
                        lyr.textItem.el.style.zIndex = String(10 + idx);
                        lyr.textItem.el.style.display = lyr.visible ? "" : "none";
                        lyr.textItem.el.style.opacity = String(clamp(Number(lyr.opacity ?? 1), 0, 1));
                    }
                });
            }

            function compositeLayerCanvas(targetCtx, layerCanvas, lyr) {
                targetCtx.save();
                targetCtx.globalCompositeOperation = "source-over";
                targetCtx.globalAlpha = clamp(Number(lyr.opacity ?? 1), 0, 1);
                targetCtx.drawImage(layerCanvas, 0, 0);
                targetCtx.restore();
            }
            
            function rebuildCommittedLayer() {
                committedCtx.clearRect(0, 0, 500, 500);
                const activeDraw = getActiveDrawLayer();
                const activeCount = isDrawing && currentStroke ? (1 + mirrorStrokes.length) : 0;
                for (const lyr of layers) {
                    if (!lyr.visible || lyr.type !== "draw") continue;
                    const list = (lyr === activeDraw && activeCount > 0)
                    ? lyr.strokes.slice(0, Math.max(0, lyr.strokes.length - activeCount))
                    : lyr.strokes;
                    if (!list.length) continue;
                    renderStrokesInstant(layerScratchCtx, list, 500, true);
                    if (lyr.clipToBelow) {
                        layerScratchCtx.save();
                        layerScratchCtx.globalCompositeOperation = "destination-in";
                        layerScratchCtx.drawImage(committedCanvas, 0, 0);
                        layerScratchCtx.restore();
                    }
                    compositeLayerCanvas(committedCtx, layerScratchCanvas, lyr);
                }
                committedCount = activeDraw.strokes.length - activeCount;
            }

            function renderClippedLiveStack(activeDraw, activeCount) {
                committedCtx.clearRect(0, 0, 500, 500);
                for (const lyr of layers) {
                    if (!lyr.visible || lyr.type !== "draw") continue;
                    const isLiveLayer = lyr === activeDraw && activeCount > 0;
                    const list = isLiveLayer ? lyr.strokes.slice(0, -activeCount) : lyr.strokes;
                    if (!list.length && !isLiveLayer) continue;
                    renderStrokesInstant(layerScratchCtx, list, 500, true);
                    if (isLiveLayer) renderStrokesInstant(layerScratchCtx, lyr.strokes.slice(-activeCount), 500, false);
                    if (lyr.clipToBelow) {
                        layerScratchCtx.save();
                        layerScratchCtx.globalCompositeOperation = "destination-in";
                        layerScratchCtx.drawImage(committedCanvas, 0, 0);
                        layerScratchCtx.restore();
                    }
                    compositeLayerCanvas(committedCtx, layerScratchCanvas, lyr);
                }
                drawCtx.clearRect(0, 0, 500, 500);
                drawCtx.drawImage(committedCanvas, 0, 0);
                committedCount = activeDraw.strokes.length - activeCount;
            }
            
            var liveCache = null;
            function makeLayerCanvas() {
                const c = document.createElement("canvas");
                c.width = 500; c.height = 500;
                return c;
            }
            
            function drawLiveStroke(active, activeCount) {
                const baseStrokes = active.strokes.slice(0, Math.max(0, active.strokes.length - activeCount));
                const key = layers.map(l =>
                    l.id + (l.visible ? "+" : "-") + (l.type === "draw" ? ":" + (l === active ? baseStrokes.length : l.strokes.length) + ":" + (l.opacity ?? 1) : "")
                ).join("|");
                
                if (!liveCache || liveCache.key !== key) {
                    const below = makeLayerCanvas(), above = makeLayerCanvas(), base = makeLayerCanvas();
                    const belowCtx = below.getContext("2d"), aboveCtx = above.getContext("2d"), baseCtx = base.getContext("2d");
                    let seenActive = false;
                    for (const lyr of layers) {
                        if (lyr === active) {
                            seenActive = true;
                            renderStrokesInstant(baseCtx, baseStrokes, 500, true);
                            continue;
                        }
                        if (!lyr.visible || lyr.type !== "draw" || !lyr.strokes.length) continue;
                        renderStrokesInstant(layerScratchCtx, lyr.strokes, 500, true);
                        compositeLayerCanvas(seenActive ? aboveCtx : belowCtx, layerScratchCanvas, lyr);
                    }
                    liveCache = { key, below, above, base };
                }
                
                layerScratchCtx.clearRect(0, 0, 500, 500);
                layerScratchCtx.drawImage(liveCache.base, 0, 0);
                renderStrokesInstant(layerScratchCtx, active.strokes.slice(-activeCount), 500, false);
                
                drawCtx.clearRect(0, 0, 500, 500);
                drawCtx.drawImage(liveCache.below, 0, 0);
                compositeLayerCanvas(drawCtx, layerScratchCanvas, active);
                drawCtx.drawImage(liveCache.above, 0, 0);
            }
            
            function redrawStudio(skipLayerPanel = false) {
                updateShapeOverlay();
                const activeDraw = getActiveDrawLayer();
                const activeCount = isDrawing && currentStroke ? (1 + mirrorStrokes.length) : 0;
                const live = activeCount > 0 && activeDraw.visible;
                if (live) {
                    if (layers.some(l => l.clipToBelow)) renderClippedLiveStack(activeDraw, activeCount);
                    else drawLiveStroke(activeDraw, activeCount);
                } else {
                    liveCache = null;
                    rebuildCommittedLayer();
                    drawCtx.clearRect(0, 0, 500, 500);
                    drawCtx.drawImage(committedCanvas, 0, 0);
                    if (!skipLayerPanel && document.getElementById("pane-layers")?.classList.contains("active")) {
                        renderLayersPanel();      // thumbnails only when not mid-stroke
                    }
                }
            }
            
            function addDrawLayer() {
                layerCounter++;
                const id = "layer_" + Date.now() + "_" + Math.random().toString(36).slice(2, 5);
                const newLyr = { id, name: "Layer " + layerCounter, type: "draw", visible: true, opacity: 1, alphaLock: false, clipToBelow: false, strokes: [], redoStack: [] };
                const idx = layers.findIndex(l => l.id === activeLayerId);
                if (idx >= 0) layers.splice(idx + 1, 0, newLyr);
                else layers.push(newLyr);
                activeLayerId = id;
                deselectText();
                if (currentTool === "hand") setTool("brush");
                syncTextLayerZOrder();
                renderLayersPanel();
                updateHistoryUI();
                scheduleDraftSave();
                haptic(8);
                showToast("Added " + newLyr.name);
            }
            
            function selectLayer(id) {
                const lyr = layers.find(l => l.id === id);
                if (!lyr) return;
                if (lyr.shape) {
                    selectShape(id);
                } else {
                    selectShape(null);
                    activeLayerId = id;
                    if (lyr.type === "text" && lyr.textItem) {
                        setTool("hand");
                        selectText(lyr.textItem);
                    } else {
                        deselectText();
                    }
                }
                renderLayersPanel();
                updateHistoryUI();
                haptic(6);
            }
            
            function toggleLayerVisibility(id, e) {
                if (e) e.stopPropagation();
                const lyr = layers.find(l => l.id === id);
                if (!lyr) return;
                lyr.visible = !lyr.visible;
                if (lyr.type === "text" && lyr.textItem) {
                    lyr.textItem.el.style.display = lyr.visible ? "" : "none";
                    if (!lyr.visible && selectedText === lyr.textItem) deselectText();
                }
                redrawStudio();
                renderLayersPanel();
                scheduleDraftSave();
                haptic(6);
            }

            function setLayerOpacity(id, value, control) {
                const lyr = layers.find(layer => layer.id === id);
                if (!lyr) return;
                lyr.opacity = clamp(Number(value) / 100, 0, 1);
                const percent = Math.round(lyr.opacity * 100);
                const row = control.closest(".layer-row");
                const valueLabel = row && row.querySelector(".layer-opacity-value");
                if (valueLabel) valueLabel.textContent = percent + "%";
                if (lyr.type === "text" && lyr.textItem) lyr.textItem.el.style.opacity = String(lyr.opacity);
                const thumb = row && row.querySelector(".layer-thumb canvas, .layer-thumb");
                if (thumb) thumb.style.opacity = String(lyr.opacity);
                redrawStudio(true);
                scheduleDraftSave();
            }

            function toggleLayerAlphaLock(id, e) {
                if (e) e.stopPropagation();
                const lyr = layers.find(l => l.id === id && l.type === "draw");
                if (!lyr) return;
                lyr.alphaLock = !lyr.alphaLock;
                renderLayersPanel();
                scheduleDraftSave();
                haptic(6);
                showToast(lyr.alphaLock ? "Alpha lock enabled for new paint" : "Alpha lock disabled");
            }

            function toggleLayerClip(id, e) {
                if (e) e.stopPropagation();
                const idx = layers.findIndex(l => l.id === id);
                const lyr = layers[idx];
                if (!lyr || lyr.type !== "draw") return;
                if (!layers.slice(0, idx).some(layer => layer.type === "draw")) {
                    showToast("Add a layer below before clipping");
                    return;
                }
                lyr.clipToBelow = !lyr.clipToBelow;
                redrawStudio();
                renderLayersPanel();
                scheduleDraftSave();
                haptic(6);
                showToast(lyr.clipToBelow ? "Layer clipped to content below" : "Layer clipping disabled");
            }
            
            function moveLayerOrder(id, dir, e) {
                if (e) e.stopPropagation();
                const idx = layers.findIndex(l => l.id === id);
                const targetIdx = idx + dir;
                if (idx < 0 || targetIdx < 0 || targetIdx >= layers.length) return;
                const [moved] = layers.splice(idx, 1);
                layers.splice(targetIdx, 0, moved);
                normalizeLayerClipping();
                syncTextLayerZOrder();
                redrawStudio();
                renderLayersPanel();
                scheduleDraftSave();
                haptic(6);
            }
            
            function deleteLayerById(id, e) {
                if (e) e.stopPropagation();
                if (collabChannel && id === collabSharedLayerId) {
                    showToast("Leave the shared room before deleting its drawing layer");
                    return;
                }
                const idx = layers.findIndex(l => l.id === id);
                if (idx < 0) return;
                const lyr = layers[idx];
                if (lyr.type === "text" && lyr.textItem) {
                    deleteTextItem(lyr.textItem);
                    return;
                }
                if (lyr.shape) {
                    layers.splice(idx, 1);
                    if (selectedShapeId === id) selectShape(null);
                    redrawStudio(); updateHistoryUI(); renderLayersPanel(); scheduleDraftSave(); haptic(8);
                    showToast("Deleted " + lyr.name);
                    return;
                }
                const drawLayers = layers.filter(l => l.type === "draw");
                if (drawLayers.length <= 1) {
                    lyr.strokes = [];
                    lyr.redoStack = [];
                    redrawStudio();
                    updateHistoryUI();
                    renderLayersPanel();
                    scheduleDraftSave();
                    showToast("Cleared base layer");
                    return;
                }
                layers.splice(idx, 1);
                normalizeLayerClipping();
                if (activeLayerId === id) {
                    const fallback = layers[Math.max(0, idx - 1)] || layers[0];
                    activeLayerId = fallback.id;
                }
                redrawStudio();
                updateHistoryUI();
                renderLayersPanel();
                scheduleDraftSave();
                haptic(8);
                showToast("Deleted " + lyr.name);
            }
            
            function mergeLayerDown() {
                const idx = layers.findIndex(l => l.id === focusLayerId());
                if (idx <= 0) { showToast("No layer below to merge into"); return; }
                const top = layers[idx], below = layers[idx - 1];
                if (collabChannel && (top.id === collabSharedLayerId || below.id === collabSharedLayerId)) {
                    showToast("Leave the shared room before merging its drawing layer");
                    return;
                }
                if (below.type !== "draw" || below.shape) { showToast("Can only merge onto a drawing layer"); return; }
                if (top.clipToBelow) { showToast("Disable clipping before merging this layer"); return; }
                if (Number(top.opacity ?? 1) < 1 || Number(below.opacity ?? 1) < 1) {
                    showToast("Set both layer opacities to 100% before merging");
                    return;
                }
                askConsent("Merge layers?",
                    `"${top.name}" will be merged into "${below.name}". You won't be able to separate them again.`,
                    () => mergeLayers(top.id, below.id), { okLabel: "Merge" });
                }
                
                function mergeLayers(topId, belowId) {
                    const top = layers.find(l => l.id === topId);
                    const below = layers.find(l => l.id === belowId);
                    if (!top || !below) return;
                    if (top.type === "draw") {
                        below.strokes.push(...top.strokes);
                    } else if (top.type === "text" && top.textItem) {
                        const t = top.textItem;
                        if ((t.t || "").trim()) {
                            below.strokes.push({ k: "text", t: t.t.slice(0, 120), x: Math.round(t.x), y: Math.round(t.y), c: t.c, f: t.f, fn: t.fn || "Inter" });
                        }
                        texts = texts.filter(x => x !== t);
                        if (selectedText === t) selectedText = null;
                        t.el.remove();
                    }
                    layers = layers.filter(l => l !== top);
                    normalizeLayerClipping();
                    if (selectedShapeId === topId) selectShape(null);
                    activeLayerId = below.id;
                    redrawStudio();
                    updateHistoryUI();
                    renderLayersPanel();
                    scheduleDraftSave();
                    haptic(10);
                    showToast("Merged into " + below.name);
                }
                
                function renderLayersPanel() {
                    const list = document.getElementById("layer-list");
                    if (!list) return;
                    const closeMenu = menu => {
                        menu.hidden = true;
                        if (menu._layerRow) menu._layerRow.classList.remove("menu-open");
                        const trigger = menu._layerTrigger || menu.parentElement.querySelector(".layer-more-btn");
                        if (trigger) trigger.setAttribute("aria-expanded", "false");
                        if (menu.parentElement === document.body && menu._layerHome) {
                            menu._layerHome.appendChild(menu);
                        }
                    };
                    if (!renderLayersPanel.menuDismissBound) {
                        const dismissOpenMenus = () => {
                            document.querySelectorAll(".layer-more-menu:not([hidden])").forEach(menu => {
                                closeMenu(menu);
                            });
                        };
                        document.addEventListener("pointerdown", event => {
                            if (event.target.closest && event.target.closest(".layer-actions, .layer-more-menu")) return;
                            dismissOpenMenus();
                        });
                        document.addEventListener("scroll", event => {
                            if (event.target.closest && event.target.closest(".layer-more-menu")) return;
                            dismissOpenMenus();
                        }, true);
                        window.addEventListener("resize", dismissOpenMenus);
                        document.addEventListener("keydown", event => {
                            if (event.key !== "Escape") return;
                            document.querySelectorAll(".layer-more-menu:not([hidden])").forEach(menu => {
                                closeMenu(menu);
                                if (menu._layerTrigger) menu._layerTrigger.focus();
                            });
                        });
                        renderLayersPanel.menuDismissBound = true;
                    }
                    document.querySelectorAll(".layer-more-menu:not([hidden])").forEach(closeMenu);
                    list.replaceChildren();
                    for (let i = layers.length - 1; i >= 0; i--) {
                        const lyr = layers[i];
                        const row = document.createElement("div");
                        row.className = "layer-row" + (lyr.id === focusLayerId() ? " active" : "") + (!lyr.visible ? " is-hidden" : "");
                        row.dataset.id = lyr.id;
                        row.onclick = () => selectLayer(lyr.id);
                        
                        const thumb = document.createElement("div");
                        thumb.className = "layer-thumb";
                        if (lyr.type === "text") {
                            thumb.textContent = "T";
                            if (lyr.textItem) thumb.style.color = lyr.textItem.c;
                            thumb.style.opacity = String(clamp(Number(lyr.opacity ?? 1), 0, 1));
                        } else {
                            const cv = document.createElement("canvas");
                            cv.width = cv.height = 68;
                            cv.style.opacity = String(clamp(Number(lyr.opacity ?? 1), 0, 1));
                            renderStrokesInstant(cv.getContext("2d"), lyr.strokes, 68, true);
                            thumb.appendChild(cv);
                        }
                        
                        const meta = document.createElement("div");
                        meta.className = "layer-meta";
                        const nm = document.createElement("div");
                        nm.className = "layer-name";
                        nm.textContent = lyr.name;
                        const sub = document.createElement("div");
                        sub.className = "layer-sub";
                        sub.textContent = lyr.type === "text"
                        ? "Text Layer" : lyr.shape ? "Shape · tap to edit" : `${lyr.strokes.length} stroke${lyr.strokes.length === 1 ? "" : "s"}`;
                        const opacityControl = document.createElement("div");
                        opacityControl.className = "layer-opacity-control";
                        const opacityInput = document.createElement("input");
                        opacityInput.type = "range";
                        opacityInput.min = "0";
                        opacityInput.max = "100";
                        opacityInput.step = "1";
                        opacityInput.value = String(Math.round(clamp(Number(lyr.opacity ?? 1), 0, 1) * 100));
                        opacityInput.setAttribute("aria-label", lyr.name + " opacity");
                        opacityInput.title = "Layer opacity";
                        opacityInput.oninput = e => {
                            e.stopPropagation();
                            setLayerOpacity(lyr.id, opacityInput.value, opacityInput);
                        };
                        const opacityValue = document.createElement("span");
                        opacityValue.className = "layer-opacity-value";
                        opacityValue.textContent = opacityInput.value + "%";
                        opacityControl.append(opacityInput, opacityValue);
                        meta.append(nm, sub, opacityControl);
                        
                        const acts = document.createElement("div");
                        acts.className = "layer-actions";
                        
                        const visBtn = document.createElement("button");
                        visBtn.type = "button";
                        visBtn.className = "layer-ico-btn" + (!lyr.visible ? " off" : "");
                        visBtn.textContent = lyr.visible ? "👁" : "🙈";
                        visBtn.title = lyr.visible ? "Hide layer" : "Show layer";
                        visBtn.onclick = (e) => toggleLayerVisibility(lyr.id, e);

                        const alphaBtn = document.createElement("button");
                        alphaBtn.type = "button";
                        alphaBtn.className = "layer-menu-item" + (lyr.alphaLock ? " selected" : "");
                        alphaBtn.textContent = lyr.alphaLock ? "α  Alpha Lock (On)" : "α  Alpha Lock";
                        alphaBtn.title = lyr.alphaLock ? "Alpha lock on: new paint stays within existing pixels" : "Lock this layer's existing transparency";
                        alphaBtn.setAttribute("aria-label", alphaBtn.title);
                        alphaBtn.setAttribute("aria-pressed", lyr.alphaLock ? "true" : "false");
                        alphaBtn.setAttribute("role", "menuitem");
                        alphaBtn.disabled = lyr.type !== "draw";
                        alphaBtn.onclick = (e) => toggleLayerAlphaLock(lyr.id, e);

                        const clipBtn = document.createElement("button");
                        clipBtn.type = "button";
                        clipBtn.className = "layer-menu-item" + (lyr.clipToBelow ? " selected" : "");
                        clipBtn.textContent = lyr.clipToBelow ? "⌁  Clip to below (On)" : "⌁  Clip to below";
                        clipBtn.title = lyr.clipToBelow ? "Clipping on: mask to visible content below" : "Clip this layer to visible content below";
                        clipBtn.setAttribute("aria-label", clipBtn.title);
                        clipBtn.setAttribute("aria-pressed", lyr.clipToBelow ? "true" : "false");
                        clipBtn.setAttribute("role", "menuitem");
                        clipBtn.disabled = lyr.type !== "draw" || !layers.slice(0, i).some(layer => layer.type === "draw");
                        clipBtn.onclick = (e) => toggleLayerClip(lyr.id, e);
                        
                        const upBtn = document.createElement("button");
                        upBtn.type = "button";
                        upBtn.className = "layer-menu-item";
                        upBtn.textContent = "↑  Move up";
                        upBtn.title = "Move layer up";
                        upBtn.setAttribute("role", "menuitem");
                        upBtn.disabled = (i === layers.length - 1);
                        upBtn.onclick = (e) => moveLayerOrder(lyr.id, 1, e);
                        
                        const dnBtn = document.createElement("button");
                        dnBtn.type = "button";
                        dnBtn.className = "layer-menu-item";
                        dnBtn.textContent = "↓  Move down";
                        dnBtn.title = "Move layer down";
                        dnBtn.setAttribute("role", "menuitem");
                        dnBtn.disabled = (i === 0);
                        dnBtn.onclick = (e) => moveLayerOrder(lyr.id, -1, e);
                        
                        const delBtn = document.createElement("button");
                        delBtn.type = "button";
                        delBtn.className = "layer-menu-item danger";
                        delBtn.textContent = "×  Delete layer";
                        delBtn.title = "Delete layer";
                        delBtn.setAttribute("role", "menuitem");
                        delBtn.onclick = (e) => deleteLayerById(lyr.id, e);
                        
                        const menu = document.createElement("div");
                        menu.className = "layer-more-menu";
                        menu.hidden = true;
                        menu.setAttribute("role", "menu");
                        menu.append(alphaBtn, clipBtn, upBtn, dnBtn, delBtn);
                        menu.addEventListener("click", event => {
                            if (event.target.closest && event.target.closest(".layer-menu-item")) closeMenu(menu);
                        });

                        const moreBtn = document.createElement("button");
                        moreBtn.type = "button";
                        moreBtn.className = "layer-ico-btn layer-more-btn";
                        moreBtn.textContent = "⋯";
                        moreBtn.title = "More layer actions";
                        moreBtn.setAttribute("aria-label", "More layer actions");
                        moreBtn.setAttribute("aria-expanded", "false");
                        moreBtn.setAttribute("aria-haspopup", "menu");
                        moreBtn.onclick = e => {
                            e.stopPropagation();
                            const open = menu.hidden;
                            document.querySelectorAll(".layer-more-menu:not([hidden])").forEach(otherMenu => {
                                closeMenu(otherMenu);
                            });
                            menu._layerHome = acts;
                            menu._layerRow = row;
                            menu._layerTrigger = moreBtn;
                            menu.hidden = !open;
                            row.classList.toggle("menu-open", open);
                            moreBtn.setAttribute("aria-expanded", String(open));
                            if (open) {
                                document.body.appendChild(menu);
                                menu.style.maxHeight = "";
                                const triggerRect = moreBtn.getBoundingClientRect();
                                const menuRect = menu.getBoundingClientRect();
                                const viewportWidth = document.documentElement.clientWidth;
                                const maxBottom = document.documentElement.clientHeight - 8;
                                const left = Math.max(8, Math.min(triggerRect.right - menuRect.width, viewportWidth - menuRect.width - 8));
                                const belowSpace = Math.max(0, maxBottom - triggerRect.bottom - 4);
                                const aboveSpace = Math.max(0, triggerRect.top - 12);
                                const placeAbove = menuRect.height > belowSpace && aboveSpace > belowSpace;
                                const availableSpace = placeAbove ? aboveSpace : belowSpace;
                                if (menuRect.height > availableSpace) {
                                    menu.style.maxHeight = Math.max(64, availableSpace) + "px";
                                }
                                const adjustedHeight = menu.getBoundingClientRect().height;
                                let top = placeAbove ? triggerRect.top - adjustedHeight - 4 : triggerRect.bottom + 4;
                                top = Math.max(8, Math.min(top, maxBottom - adjustedHeight));
                                menu.style.left = left + "px";
                                menu.style.top = top + "px";
                            }
                        };

                        acts.append(visBtn, moreBtn, menu);
                        row.append(thumb, meta, acts);
                        list.appendChild(row);
                    }
                }
                
                function scheduleStudioRedraw() {
                    if (studioDrawRaf) return;
                    studioDrawRaf = requestAnimationFrame(() => {
                        studioDrawRaf = 0;
                        redrawStudio();
                    });
                }
                
                function undoStroke() {
                    if (isPreviewing || strokes.length === 0) return;
                    const undone = strokes.pop();
                    redoStack.push(undone);
                    if (collabChannel && undone && undone.__collabId) {
                        collabSend("stroke-remove", { peerId: collabSelfKey, strokeId: undone.__collabId });
                    }
                    haptic(6);
                    redrawStudio();
                    updateHistoryUI();
                    scheduleDraftSave();
                }
                
                function redoStroke() {
                    if (isPreviewing || redoStack.length === 0) return;
                    const restored = redoStack.pop();
                    strokes.push(restored);
                    if (collabChannel && restored && restored.__collabId) commitCollabStrokeGroup([restored]);
                    haptic(6);
                    redrawStudio();
                    updateHistoryUI();
                    scheduleDraftSave();
                }
                
                let pendingCriticalAction = null;
                
                function confirmCriticalAction(title, message, action) {
                    if (pendingCriticalAction) return;
                    document.getElementById("confirm-title").textContent = title;
                    document.getElementById("confirm-message").textContent = message;
                    pendingCriticalAction = action;
                    document.getElementById("confirm-overlay").hidden = false;
                    document.getElementById("confirm-continue").focus();
                }
                
                function cancelCriticalAction() {
                    pendingCriticalAction = null;
                    document.getElementById("confirm-overlay").hidden = true;
                }
                
                function continueCriticalAction() {
                    const action = pendingCriticalAction;
                    cancelCriticalAction();
                    if (action) action();
                }
                
                document.addEventListener("keydown", (event) => {
                    if (event.key === "Escape" && pendingCriticalAction) cancelCriticalAction();
                });
                
                function clearCanvas(confirmed = false) {
                    if (isPreviewing) return;
                    if (!confirmed) {
                        if (getAllFlattenedStrokes(true).length === 0) {
                            showToast("Canvas is already clear.");
                            return;
                        }
                        confirmCriticalAction(
                            "Clear your canvas?",
                            "This will permanently remove the drawing and text currently on your canvas.",
                            () => clearCanvas(true)
                        );
                        return;
                    }
                    isDrawing = false;
                    currentStroke = null;
                    stabilizerPoint = null;
                    mirrorStrokes = [];
                    shapeStart = null;
                    previewCtx.clearRect(0, 0, 500, 500);
                    clearTexts();
                    selectShape(null);
                    layers = [{ id: "layer_base", name: "Layer 1", type: "draw", visible: true, opacity: 1, alphaLock: false, clipToBelow: false, strokes: [], redoStack: [] }];
                    activeLayerId = "layer_base";
                    layerCounter = 1;
                    if (collabChannel && collabSharedLayerId) {
                        collabSeenStrokeIds.clear();
                        ensureCollabSharedLayer();
                        collabSend("clear-shared", { peerId: collabSelfKey });
                    }
                    resetStudioZoom();
                    redrawStudio();
                    updateHistoryUI();
                    renderLayersPanel();
                    scheduleDraftSave();
                }
                
                
                
                function previewDrawing() {
                    const all = getAllFlattenedStrokes(false);
                    if (all.length === 0 || isPreviewing) return;
                    deselectText();
                    resetStudioZoom();
                    isPreviewing = true;
                    textLayer.style.visibility = "hidden";
                    const refLayer = document.getElementById("ref-layer");
                    const wasRefVisible = !refLayer.hidden;
                    if (wasRefVisible) refLayer.hidden = true;
                    setPreviewOverlaysHidden(true);
                    
                    animateStrokes(drawCtx, all, 500, 1, () => {
                        isPreviewing = false;
                        textLayer.style.visibility = "visible";
                        if (wasRefVisible) refLayer.hidden = false;
                        setPreviewOverlaysHidden(false);
                        redrawStudio();
                    });
                }
                
                function downloadCanvas(canvas, filename) {
                    canvas.toBlob((blob) => {
                        if (!blob) { showToast("Could not create the PNG."); return; }
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = filename;
                        document.body.appendChild(a);
                        a.click();
                        a.remove();
                        setTimeout(() => URL.revokeObjectURL(url), 3000);
                    }, "image/png");
                }
                
                async function exportStrokesPNG(strokeList, filename, meta = {}) {
                    const INK = "#111827";
                    const SLATE = "#6b7280";
                    const SANS = 'Inter, "Helvetica Neue", Arial, sans-serif';
                    const MONO = '"JetBrains Mono", ui-monospace, monospace';
                    
                    try {
                        await Promise.all([
                            document.fonts.load("900 40px Inter"),
                            document.fonts.load('500 20px "JetBrains Mono"')
                        ]);
                    } catch (_) { /* system font fallback */ }
                    
                    const dim = 2000;            // output is a 2000x2000 square
                    const S = dim / 1000;        // 1 design unit at 1000px
                    const c = document.createElement("canvas");
                    c.width = dim; c.height = dim;
                    const ctx = c.getContext("2d");
                    const rr = (x, y, w, h, r) => { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); };
                    
                    // ---------- wall ----------
                    const wall = ctx.createRadialGradient(dim / 2, dim * 0.4, dim * 0.1, dim / 2, dim / 2, dim * 0.75);
                    wall.addColorStop(0, "#eceff3");
                    wall.addColorStop(1, "#d5dae1");
                    ctx.fillStyle = wall;
                    ctx.fillRect(0, 0, dim, dim);
                    
                    // ---------- frame + white surface ----------
                    const F = 12 * S;
                    const surf = 700 * S;
                    const fW = surf + F * 2;
                    const fx = (dim - fW) / 2, fy = 56 * S;
                    const sx = fx + F, sy = fy + F;
                    
                    ctx.save();
                    ctx.shadowColor = "rgba(15, 23, 42, 0.28)";
                    ctx.shadowBlur = 36 * S;
                    ctx.shadowOffsetY = 14 * S;
                    const metal = ctx.createLinearGradient(0, fy, 0, fy + fW);
                    metal.addColorStop(0, "#f4f5f7");
                    metal.addColorStop(0.5, "#c3c8d0");
                    metal.addColorStop(1, "#a9afb9");
                    ctx.fillStyle = metal;
                    rr(fx, fy, fW, fW, 14 * S);
                    ctx.fill();
                    ctx.restore();
                    
                    // doodle on a white surface (rendered the same way as before)
                    const artPx = Math.round(surf);
                    const art = document.createElement("canvas");
                    art.width = artPx; art.height = artPx;
                    const actx = art.getContext("2d");
                    actx.fillStyle = bgOf(strokeList);
                    actx.fillRect(0, 0, artPx, artPx);
                    renderStrokesInstant(actx, strokeList, artPx, true);
                    
                    ctx.save();
                    rr(sx, sy, surf, surf, 6 * S);
                    ctx.clip();
                    ctx.fillStyle = "#ffffff";
                    ctx.fillRect(sx, sy, surf, surf);
                    ctx.drawImage(art, sx, sy, surf, surf);
                    // faint sheen on top
                    const sheen = ctx.createLinearGradient(sx, sy, sx + surf, sy + surf);
                    sheen.addColorStop(0, "rgba(226, 232, 240, 0.45)");
                    sheen.addColorStop(0.3, "rgba(255, 255, 255, 0)");
                    sheen.addColorStop(0.75, "rgba(255, 255, 255, 0)");
                    sheen.addColorStop(1, "rgba(226, 232, 240, 0.35)");
                    ctx.fillStyle = sheen;
                    ctx.fillRect(sx, sy, surf, surf);
                    ctx.restore();
                    
                    // ---------- marker tray ----------
                    const trayW = 440 * S, trayH = 30 * S;
                    const trayX = (dim - trayW) / 2;
                    const trayY = fy + fW - 4 * S;
                    ctx.save();
                    ctx.shadowColor = "rgba(15, 23, 42, 0.25)";
                    ctx.shadowBlur = 14 * S;
                    ctx.shadowOffsetY = 6 * S;
                    const trayG = ctx.createLinearGradient(0, trayY, 0, trayY + trayH);
                    trayG.addColorStop(0, "#d9dde3");
                    trayG.addColorStop(1, "#a3a9b4");
                    ctx.fillStyle = trayG;
                    rr(trayX, trayY, trayW, trayH, [0, 0, 10 * S, 10 * S]);
                    ctx.fill();
                    ctx.restore();
                    
                    const cols = ["#111827", "#e11d48", "#2563eb"];
                    let mx = trayX + 40 * S;
                    cols.forEach((col, i) => {
                        ctx.save();
                        ctx.translate(mx, trayY + 6 * S);
                        ctx.rotate((i % 2 ? 1.5 : -1) * Math.PI / 180);
                        ctx.fillStyle = "#f8fafc";
                        ctx.strokeStyle = "#aab0ba";
                        ctx.lineWidth = 1.2 * S;
                        rr(0, 0, 90 * S, 16 * S, 6 * S);
                        ctx.fill(); ctx.stroke();
                        ctx.fillStyle = col;
                        rr(0, 0, 26 * S, 16 * S, [6 * S, 2 * S, 2 * S, 6 * S]);
                        ctx.fill();
                        ctx.fillRect(50 * S, 0, 8 * S, 16 * S);
                        ctx.restore();
                        mx += 112 * S;
                    });
                    
                    // ---------- caption (bottom-left) ----------
                    const exportDate = new Date().toLocaleDateString("en-PH", {
                        year: "numeric", month: "short", day: "2-digit"
                    });
                    const capX = 90 * S;
                    ctx.textAlign = "left";
                    ctx.textBaseline = "alphabetic";
                    ctx.fillStyle = INK;
                    ctx.font = `900 ${54 * S}px ${SANS}`;
                    ctx.fillText("Freedom Wall", capX, 905 * S);
                    
                    // short marker underline
                    ctx.save();
                    ctx.strokeStyle = "#e11d48";
                    ctx.lineWidth = 5 * S;
                    ctx.lineCap = "round";
                    ctx.beginPath();
                    ctx.moveTo(capX + 2 * S, 925 * S);
                    ctx.bezierCurveTo(capX + 60 * S, 919 * S, capX + 120 * S, 931 * S, capX + 190 * S, 923 * S);
                    ctx.stroke();
                    ctx.restore();
                    
                    ctx.fillStyle = SLATE;
                    ctx.font = `500 ${17 * S}px ${SANS}`;
                    if (meta.author) {
                        ctx.fillStyle = INK;
                        ctx.font = `700 ${19 * S}px ${SANS}`;
                        ctx.fillText(`Drawn by ${meta.author}`, capX, 958 * S);
                        ctx.fillStyle = SLATE;
                    } else {
                        ctx.fillText("THE ARTcher · ArcherStudio", capX, 958 * S);
                    }
                    ctx.font = `500 ${14 * S}px ${MONO}`;
                    const tileTag = Number.isFinite(meta.gx) ? ` · Tile ${meta.gx},${meta.gy}` : "";
                    ctx.fillText(`${WALL_VERSION}${tileTag} · ${exportDate}`, capX, 980 * S);
                    
                    let qrImg = null;
                    try { qrImg = await loadQRForExport(currentWallShareUrl(), 360); } catch (_) {}
                    
                    const nW = 190 * S, nH = 230 * S;
                    const nX = dim - 90 * S - nW, nY = 760 * S;
                    ctx.save();
                    ctx.translate(nX + nW / 2, nY + nH / 2);
                    ctx.rotate(2 * Math.PI / 180);
                    ctx.translate(-nW / 2, -nH / 2);
                    ctx.shadowColor = "rgba(15, 23, 42, 0.22)";
                    ctx.shadowBlur = 16 * S;
                    ctx.shadowOffsetY = 6 * S;
                    ctx.fillStyle = "#ffffff";
                    rr(0, 0, nW, nH, 8 * S);
                    ctx.fill();
                    ctx.shadowColor = "transparent";
                    ctx.strokeStyle = "#d4d8df";
                    ctx.lineWidth = 1.5 * S;
                    ctx.stroke();
                    
                    const qs = nW - 40 * S;
                    if (qrImg) ctx.drawImage(qrImg, 20 * S, 34 * S, qs, qs);
                    ctx.textAlign = "center";
                    ctx.fillStyle = INK;
                    ctx.font = `900 ${21 * S}px ${SANS}`;
                    ctx.fillText("Scan to join", nW / 2, 34 * S + qs + 32 * S);
                    
                    const mg = ctx.createRadialGradient(nW / 2 - 3 * S, 8 * S, 1 * S, nW / 2, 14 * S, 12 * S);
                    mg.addColorStop(0, "#fb7185");
                    mg.addColorStop(1, "#be123c");
                    ctx.save();
                    ctx.shadowColor = "rgba(0, 0, 0, 0.3)";
                    ctx.shadowBlur = 6 * S;
                    ctx.shadowOffsetY = 3 * S;
                    ctx.fillStyle = mg;
                    ctx.beginPath();
                    ctx.arc(nW / 2, 16 * S, 11 * S, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.restore();
                    ctx.restore();
                    
                    if (meta.asBlob) return new Promise(r => c.toBlob(r, "image/png"));
                    downloadCanvas(c, filename);
                }
                
                function saveStudioPNG() {
                    const all = getAllFlattenedStrokes(false);
                    if (all.length === 0) { showToast("Draw something first."); return; }
                    if (paperBg !== "#ffffff") all.unshift({ k: "bg", c: paperBg });
                    exportStrokesPNG(all, "freedom-wall-drawing-" + Date.now() + ".png");
                }
                
                function loadLogoForExport() {
                    return new Promise((resolve) => {
                        const img = new Image();
                        img.onload = () => resolve(img.naturalWidth > 0 ? img : null);
                        img.onerror = () => resolve(null);
                        img.src = LOGO_PATH;
                    });
                }
                
                const WALL_VERSION = "v1.0";
                const WALL_SHARE_URL = "https://btledorg.github.io/site/events/freedomwall.html";
                function currentWallShareUrl() {
                    return curEvent ? buildEventInviteUrl(curEvent.code) : WALL_SHARE_URL;
                }
                
                async function loadQRForExport(url, size = 320) {
                    const encoded = encodeURIComponent(url);
                    const endpoints = [
                        `https://api.qrdx.dev/v1/qr?data=${encoded}&format=png&size=${size}&margin=2`,
                        `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=8&data=${encoded}`
                    ];
                    
                    for (const src of endpoints) {
                        const ctrl = new AbortController();
                        const to = setTimeout(() => ctrl.abort(), 4500);
                        try {
                            const res = await fetch(src, { signal: ctrl.signal, mode: "cors" });
                            clearTimeout(to);
                            if (!res.ok) continue;
                            const blob = await res.blob();
                            const objUrl = URL.createObjectURL(blob);
                            const img = await new Promise((resolve, reject) => {
                                const image = new Image();
                                image.onload = () => resolve(image);
                                image.onerror = reject;
                                image.src = objUrl;
                            });
                            URL.revokeObjectURL(objUrl);
                            return img;
                        } catch (e) {
                            clearTimeout(to);
                        }
                    }
                    return null;
                }
                
                async function saveWallPNG() {
                    const INK = "#111827";
                    const SLATE = "#6b7280";
                    const SANS = 'Inter, "Helvetica Neue", Arial, sans-serif';
                    const MONO = '"JetBrains Mono", ui-monospace, monospace';
                    
                    try {
                        await Promise.all([
                            document.fonts.load("900 40px Inter"),
                            document.fonts.load("600 40px Inter"),
                            document.fonts.load('500 20px "JetBrains Mono"')
                        ]);
                    } catch (_) { }
                    
                    const outW = 3840, outH = 2160;
                    const S = outH / 1080;
                    const c = document.createElement("canvas");
                    c.width = outW; c.height = outH;
                    const ctx = c.getContext("2d");
                    const rr = (x, y, w, h, r) => { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); };
                    
                    // ---------- 1. wall behind the board ----------
                    const wall = ctx.createRadialGradient(outW / 2, outH * 0.4, outH * 0.1, outW / 2, outH / 2, outW * 0.7);
                    wall.addColorStop(0, "#eceff3");
                    wall.addColorStop(1, "#d5dae1");
                    ctx.fillStyle = wall;
                    ctx.fillRect(0, 0, outW, outH);
                    
                    // ---------- 2. frame + surface ----------
                    const M = 48 * S;
                    const fx = M, fy = M;
                    const fw = outW - M * 2;
                    const fh = outH - M * 2 - 92 * S;
                    const F = 12 * S;
                    
                    ctx.save();
                    ctx.shadowColor = "rgba(15, 23, 42, 0.28)";
                    ctx.shadowBlur = 40 * S;
                    ctx.shadowOffsetY = 16 * S;
                    const metal = ctx.createLinearGradient(0, fy, 0, fy + fh);
                    metal.addColorStop(0, "#f4f5f7");
                    metal.addColorStop(0.5, "#c3c8d0");
                    metal.addColorStop(1, "#a9afb9");
                    ctx.fillStyle = metal;
                    rr(fx, fy, fw, fh, 14 * S);
                    ctx.fill();
                    ctx.restore();
                    
                    const sx = fx + F, sy = fy + F, sw = fw - F * 2, sh = fh - F * 2;
                    ctx.fillStyle = "#ffffff";
                    rr(sx, sy, sw, sh, 6 * S);
                    ctx.fill();
                    
                    // faint studio sheen across the surface
                    ctx.save();
                    rr(sx, sy, sw, sh, 6 * S);
                    ctx.clip();
                    const sheen = ctx.createLinearGradient(sx, sy, sx + sw, sy + sh);
                    sheen.addColorStop(0, "rgba(226, 232, 240, 0.55)");
                    sheen.addColorStop(0.35, "rgba(255, 255, 255, 0)");
                    sheen.addColorStop(0.7, "rgba(255, 255, 255, 0)");
                    sheen.addColorStop(1, "rgba(226, 232, 240, 0.45)");
                    ctx.fillStyle = sheen;
                    ctx.fillRect(sx, sy, sw, sh);
                    ctx.restore();
                    
                    // ---------- 3. fit the doodles ----------
                    let minX = -1, maxX = 1, minY = -1, maxY = 1;
                    for (const e of wallEntries) {
                        minX = Math.min(minX, e.gx);
                        maxX = Math.max(maxX, e.gx + 1);
                        minY = Math.min(minY, e.gy);
                        maxY = Math.max(maxY, e.gy + 1);
                    }
                    const spanW = maxX - minX, spanH = maxY - minY;
                    const sideCol = 440 * S;                // reserved for title (left) and QR (right)
                    const padY = 40 * S;
                    let T = Math.min((sw - sideCol * 2) / spanW, (sh - padY * 2) / spanH);
                    T = Math.min(T, 170 * S);
                    const ox = sx + (sw - spanW * T) / 2 - minX * T;   // canvas x of grid origin
                    const oy = sy + (sh - spanH * T) / 2 - minY * T;   // canvas y of grid origin
                    
                    // ---------- 4. hub (logo + name) at the origin ----------
                    const [logoImg, qrImg] = await Promise.all([
                        loadLogoForExport(),
                        loadQRForExport(currentWallShareUrl(), 480)
                    ]);
                    
                    ctx.save();
                    ctx.textAlign = "center";
                    ctx.textBaseline = "middle";
                    if (logoImg) {
                        const k = Math.min((T * 1.25) / logoImg.naturalWidth, (T * 0.62) / logoImg.naturalHeight);
                        const lw = logoImg.naturalWidth * k, lh = logoImg.naturalHeight * k;
                        ctx.drawImage(logoImg, ox - lw / 2, oy - T * 0.66, lw, lh);
                        ctx.fillStyle = INK;
                        ctx.font = `900 ${T * 0.16}px ${SANS}`;
                        ctx.fillText("THE ARTcher", ox, oy + T * 0.24);
                        ctx.fillStyle = SLATE;
                        ctx.font = `600 ${T * 0.06}px ${MONO}`;
                        ctx.fillText("ARCHERSTUDIO", ox, oy + T * 0.44);
                    } else {
                        ctx.fillStyle = INK;
                        ctx.font = `900 ${T * 0.18}px ${SANS}`;
                        ctx.fillText("THE ARTcher", ox, oy - T * 0.06);
                        ctx.fillStyle = SLATE;
                        ctx.font = `600 ${T * 0.065}px ${MONO}`;
                        ctx.fillText("ARCHERSTUDIO", ox, oy + T * 0.15);
                    }
                    ctx.restore();
                    
                    // ---------- 5. doodles, drawn straight on the board ----------
                    const px = Math.ceil(T);
                    const tileBuf = document.createElement("canvas");
                    tileBuf.width = px; tileBuf.height = px;
                    const tileCtx = tileBuf.getContext("2d");
                    for (const e of wallEntries) {
                        tileCtx.clearRect(0, 0, px, px);
                        renderStrokesInstant(tileCtx, e.strokes || [], px, false);
                        const tb = bgOf(e.strokes);
                        if (tb !== "#ffffff") { ctx.fillStyle = tb; ctx.fillRect(ox + e.gx * T, oy + e.gy * T, T, T); }
                        ctx.drawImage(tileBuf, ox + e.gx * T, oy + e.gy * T, T, T);
                    }
                    
                    // ---------- 6. title (left) ----------
                    const tileCount = wallEntries.length;
                    const tx = sx + 72 * S;
                    const colTextW = sideCol - 72 * S - 24 * S;
                    
                    ctx.textAlign = "left";
                    ctx.textBaseline = "alphabetic";
                    ctx.fillStyle = INK;
                    let tSize = 90 * S;
                    ctx.font = `900 ${tSize}px ${SANS}`;
                    const wFreedom = ctx.measureText("Freedom").width;
                    if (wFreedom > colTextW) {
                        tSize *= colTextW / wFreedom;
                        ctx.font = `900 ${tSize}px ${SANS}`;
                    }
                    const ty = sy + 72 * S + tSize * 0.8;
                    ctx.fillText("Freedom", tx, ty);
                    ctx.fillText("Wall", tx, ty + tSize * 0.98);
                    
                    // hand-drawn marker underline
                    ctx.save();
                    ctx.strokeStyle = "#e11d48";
                    ctx.lineWidth = 7 * S;
                    ctx.lineCap = "round";
                    ctx.lineJoin = "round";
                    const ux = tx + 2 * S, uy = ty + tSize * 0.98 + 26 * S;
                    const uw = Math.min(colTextW, ctx.measureText("Wall").width + 70 * S);
                    ctx.beginPath();
                    ctx.moveTo(ux, uy);
                    ctx.bezierCurveTo(ux + uw * 0.25, uy - 8 * S, ux + uw * 0.45, uy + 8 * S, ux + uw * 0.7, uy - 2 * S);
                    ctx.bezierCurveTo(ux + uw * 0.82, uy - 6 * S, ux + uw * 0.92, uy + 2 * S, ux + uw, uy - 4 * S);
                    ctx.stroke();
                    ctx.restore();
                    
                    // one-line description
                    ctx.fillStyle = SLATE;
                    ctx.font = `500 ${20 * S}px ${SANS}`;
                    const blurb = "Everyone's sketches, one wall.";
                    ctx.fillText(blurb, tx, uy + 52 * S);
                    
                    // ---------- 7. count + edition (bottom-left) ----------
                    const exportDate = new Date().toLocaleDateString("en-PH", {
                        year: "numeric", month: "short", day: "2-digit"
                    });
                    const bottomY = sy + sh - 72 * S;
                    ctx.fillStyle = INK;
                    ctx.font = `900 ${64 * S}px ${SANS}`;
                    ctx.fillText(String(tileCount), tx, bottomY - 54 * S);
                    const nW = ctx.measureText(String(tileCount)).width;
                    ctx.fillStyle = SLATE;
                    ctx.font = `600 ${22 * S}px ${SANS}`;
                    ctx.fillText(tileCount === 1 ? "Sketch" : "Sketches", tx + nW + 12 * S, bottomY - 54 * S);
                    ctx.font = `500 ${15 * S}px ${MONO}`;
                    ctx.fillText(`${WALL_VERSION}.${tileCount}  ${exportDate}`, tx, bottomY - 14 * S);
                    ctx.fillText("ArcherStudio © 2026", tx, bottomY + 10 * S);
                    
                    // ---------- 8. QR note held by a magnet (right) ----------
                    const cardW = 290 * S, cardH = 372 * S;
                    const cardX = sx + sw - 72 * S - cardW;
                    const cardY = sy + sh - 72 * S - cardH;
                    ctx.save();
                    ctx.translate(cardX + cardW / 2, cardY + cardH / 2);
                    ctx.rotate(-2 * Math.PI / 180);
                    ctx.translate(-cardW / 2, -cardH / 2);
                    
                    ctx.shadowColor = "rgba(15, 23, 42, 0.22)";
                    ctx.shadowBlur = 20 * S;
                    ctx.shadowOffsetY = 8 * S;
                    ctx.fillStyle = "#ffffff";
                    rr(0, 0, cardW, cardH, 10 * S);
                    ctx.fill();
                    ctx.shadowColor = "transparent";
                    ctx.strokeStyle = "#d4d8df";
                    ctx.lineWidth = 2 * S;
                    ctx.stroke();
                    
                    const qrS = cardW - 56 * S;
                    if (qrImg) ctx.drawImage(qrImg, 28 * S, 44 * S, qrS, qrS);
                    
                    ctx.textAlign = "center";
                    ctx.fillStyle = INK;
                    ctx.font = `900 ${30 * S}px ${SANS}`;
                    ctx.fillText("Scan to join", cardW / 2, 44 * S + qrS + 46 * S);
                    ctx.fillStyle = SLATE;
                    ctx.font = `500 ${17 * S}px ${SANS}`;
                    ctx.fillText("Add your Masterpiece", cardW / 2, 44 * S + qrS + 74 * S);
                    
                    // magnet
                    ctx.save();
                    ctx.shadowColor = "rgba(0, 0, 0, 0.3)";
                    ctx.shadowBlur = 8 * S;
                    ctx.shadowOffsetY = 4 * S;
                    const mg = ctx.createRadialGradient(cardW / 2 - 4 * S, 10 * S, 2 * S, cardW / 2, 18 * S, 18 * S);
                    mg.addColorStop(0, "#fb7185");
                    mg.addColorStop(1, "#be123c");
                    ctx.fillStyle = mg;
                    ctx.beginPath();
                    ctx.arc(cardW / 2, 20 * S, 15 * S, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.restore();
                    ctx.restore();
                    
                    // ---------- 9. marker tray ----------
                    const trayW = 820 * S, trayH = 40 * S;
                    const trayX = (outW - trayW) / 2;
                    const trayY = fy + fh - 4 * S;
                    ctx.save();
                    ctx.shadowColor = "rgba(15, 23, 42, 0.25)";
                    ctx.shadowBlur = 18 * S;
                    ctx.shadowOffsetY = 8 * S;
                    const trayG = ctx.createLinearGradient(0, trayY, 0, trayY + trayH);
                    trayG.addColorStop(0, "#d9dde3");
                    trayG.addColorStop(1, "#a3a9b4");
                    ctx.fillStyle = trayG;
                    rr(trayX, trayY, trayW, trayH, [0, 0, 12 * S, 12 * S]);
                    ctx.fill();
                    ctx.restore();
                    
                    // markers resting on the tray
                    const markers = ["#111827", "#e11d48", "#2563eb", "#16a34a"];
                    const mW = 120 * S, mH = 20 * S;
                    let mx = trayX + 70 * S;
                    const my = trayY + 8 * S;
                    markers.forEach((col, i) => {
                        ctx.save();
                        ctx.translate(mx, my);
                        ctx.rotate((i % 2 ? 1.5 : -1) * Math.PI / 180);
                        ctx.fillStyle = "#f8fafc";
                        ctx.strokeStyle = "#aab0ba";
                        ctx.lineWidth = 1.5 * S;
                        rr(0, 0, mW, mH, 8 * S);
                        ctx.fill(); ctx.stroke();
                        ctx.fillStyle = col;
                        rr(0, 0, 34 * S, mH, [8 * S, 2 * S, 2 * S, 8 * S]);
                        ctx.fill();
                        ctx.fillRect(mW * 0.55, 0, 10 * S, mH);
                        ctx.restore();
                        mx += mW + 22 * S;
                    });
                    // eraser
                    ctx.fillStyle = "#1e3a8a";
                    rr(trayX + trayW - 150 * S, my - 2 * S, 90 * S, 26 * S, 5 * S);
                    ctx.fill();
                    ctx.fillStyle = "#e5e7eb";
                    rr(trayX + trayW - 150 * S, my + 8 * S, 90 * S, 16 * S, [0, 0, 5 * S, 5 * S]);
                    ctx.fill();
                    
                    // ---------- 10. save ----------
                    try {
                        downloadCanvas(c, `freedom-wall-${WALL_VERSION}-16x9-${Date.now()}.png`);
                    } catch (err) {
                        showToast("Could not create the PNG.");
                    }
                }
                function isCenterReserved(gx, gy) {
                    return (gx === -1 || gx === 0) && (gy === -1 || gy === 0);
                }
                
                function pickRandomOpenSlot(existingEntries) {
                    const occupied = new Set(existingEntries.map(e => `${e.gx},${e.gy}`));
                    let radius = 2;
                    
                    while (radius < 60) {
                        const candidates = [];
                        for (let gx = -radius; gx < radius; gx++) {
                            for (let gy = -radius; gy < radius; gy++) {
                                if (isCenterReserved(gx, gy)) continue;
                                if (!occupied.has(`${gx},${gy}`)) candidates.push({ gx, gy });
                            }
                        }
                        if (candidates.length >= 6) return candidates[Math.floor(Math.random() * candidates.length)];
                        radius++;
                    }
                    return { gx: 2, gy: 0 };
                }
                
                async function hasGoodInternet() {
                    if (!navigator.onLine) return false;
                    const ctrl = new AbortController();
                    const to = setTimeout(() => ctrl.abort(), 5000);
                    try {
                        const res = await fetch(`${GAS_WEB_APP_URL}?module=freedomwall&ping=1&_t=${Date.now()}`, { signal: ctrl.signal, cache: "no-store" });
                        return res.ok;
                    } catch (e) {
                        return false;
                    } finally {
                        clearTimeout(to);
                    }
                }

                function focusPostedKey(code = evCode()) {
                    return code ? "fw_focus_posted_v1_" + encodeURIComponent(String(code).trim().toUpperCase()) : "";
                }

                function hasFocusPostForEvent(code = evCode()) {
                    const key = focusPostedKey(code);
                    return !!key && !!lsGet(key, null);
                }

                function syncFocusPostUI() {
                    const blocked = hasFocusPostForEvent();
                    ["submit-btn", "focus-quick-post-btn"].forEach(id => {
                        const button = document.getElementById(id);
                        if (!button) return;
                        button.disabled = blocked;
                        button.textContent = blocked ? "Already posted" : "Post to wall";
                        button.title = blocked ? "This device has already posted to this event." : "";
                    });
                }
                
                function submitToWall() {
                    deselectText();
                    if (hasFocusPostForEvent()) {
                        showToast("This device has already posted to this event.");
                        return;
                    }
                    const probe = getAllFlattenedStrokes(false);
                    if (probe.length === 0) {
                        showToast("Draw something first before posting.");
                        return;
                    }
                    if (curEvent && !evIsLive()) { showToast("This event has ended. Leave it to post on the main wall."); return; }
                    // user-initiated posts: choose a tile, then pass the human check
                    openTilePicker(() => openCaptcha(() => submitToWallCore()));
                }
                
                async function submitToWallCore() {
                    deselectText();
                    if (hasFocusPostForEvent()) {
                        showToast("This device has already posted to this event.");
                        return;
                    }
                    const postingInFocusMode = focusModeActive && !!evCode();
                    const postedKey = postingInFocusMode ? focusPostedKey() : "";
                    const items = getAllFlattenedStrokes(false);
                    if (items.length && paperBg !== "#ffffff") items.unshift({ k: "bg", c: paperBg });
                    if (items.length === 0) {
                        showToast("Draw something first before posting.");
                        return;
                    }
                    
                    const cs = window.__chosenSlot; window.__chosenSlot = null;
                    const slot = (cs && !wallEntries.some(e => e.gx === cs.gx && e.gy === cs.gy)) ? cs : pickRandomOpenSlot(wallEntries);
                    const rawAuthor = document.getElementById("author-input").value.trim();
                    const author = document.getElementById("post-anonymous").checked
                    ? "Anonymous"
                    : rawAuthor || (userProfile && !userProfile.anonymous && userProfile.name ? userProfile.name : "Anonymous");
                    const entry = {
                        id: "fw_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
                        author: author,
                        gx: slot.gx,
                        gy: slot.gy,
                        strokes: items,
                        timestamp: Date.now(),
                        event: evCode()
                    };
                    
                    if (postedKey && !lsSet(postedKey, entry.id)) {
                        showToast("Couldn't save this device's one-post limit. Free up device storage and try again.");
                        return;
                    }
                    pending.push(entry);
                    myTileIds.push(entry.id); lsSet(LS_MINE, myTileIds.slice(-50));
                    if (!lsSet(LS_QUEUE, pending)) {
                        pending.pop();
                        myTileIds = myTileIds.filter(id => id !== entry.id);
                        lsSet(LS_MINE, myTileIds.slice(-50));
                        const lockCleared = !postedKey || lsRemove(postedKey);
                        if (!lockCleared) {
                            syncFocusPostUI();
                            showToast("Device storage is full; the drawing was not queued and the one-post limit could not be cleared.");
                            return;
                        }
                        showToast("Device storage is full. Upload the saved drawings first.");
                        return;
                    }
                    document.getElementById("post-anonymous").checked = false;
                    
                    if (postingInFocusMode) {
                        focusModeActive = false;
                        document.body.classList.remove("focus-mode");
                        syncFocusPostUI();
                        window.dispatchEvent(new Event("resize"));
                    }
                    rebuildEntries();
                    setUploadUI();
                    clearCanvas(true);
                    applyProfileUI();
                    setDrawTab("style");
                    switchView("wall");
                    launchConfetti();
                    playPopTone(660);
                    haptic(20);
                    if (postingInFocusMode) showToast("Posted! This device has used its one entry for this event.");
                    
                    if (AUTO_UPLOAD && await hasGoodInternet()) {
                        showToast("Uploading to the wall...");
                        uploadPending(true);
                    } else {
                        showToast("Saved offline ✓ Will upload when internet is good.");
                    }
                }
                
                function removePending(id) {
                    pending = pending.filter(p => p.id !== id);
                    lsSet(LS_QUEUE, pending);
                }
                
                async function fetchServerEntries(code = evCode()) {
                    const ctrl = new AbortController();
                    const to = setTimeout(() => ctrl.abort(), 20000);
                    try {
                        const res = await fetch(`${GAS_WEB_APP_URL}?module=freedomwall&event=${encodeURIComponent(code)}&hostToken=${encodeURIComponent(hostToken(code))}&_t=${Date.now()}`, { signal: ctrl.signal });
                        const json = await res.json();
                        if (json.ok && Array.isArray(json.data)) {
                            if (code && code === evCode() && json.event) noteEventMeta(json.event);
                            return json.data;
                        }
                        throw new Error(json.error || "Bad response");
                    } finally {
                        clearTimeout(to);
                    }
                }
                
                async function uploadPending(silent = false) {
                    if (uploading || pending.length === 0) return;
                    if (!navigator.onLine) { if (!silent) showToast("No internet right now. Try again when connected."); return; }
                    
                    uploading = true;
                    setUploadUI();
                    const total = pending.length;
                    let done = 0, dropped = 0;
                    const snaps = {};
                    
                    try {
                        for (const entry of pending.slice()) {
                            const code = entry.event || "";
                            if (!snaps[code]) {
                                const latest = await fetchServerEntries(code);
                                snaps[code] = { occupied: latest.slice(), ids: new Set(latest.map(e => e.id)) };
                            }
                            const snap = snaps[code];
                            if (snap.ids.has(entry.id)) { removePending(entry.id); done++; continue; }
                            
                            if (snap.occupied.some(o => o.gx === entry.gx && o.gy === entry.gy)) {
                                const others = pending.filter(p => p.id !== entry.id && (p.event || "") === code);
                                const slot = pickRandomOpenSlot(snap.occupied.concat(others));
                                entry.gx = slot.gx; entry.gy = slot.gy;
                                lsSet(LS_QUEUE, pending);
                            }
                            
                            const payload = {
                                action: "addFreedomWall", id: entry.id, author: entry.author, gx: entry.gx, gy: entry.gy,
                                strokes: entry.strokes, timestamp: entry.timestamp, event: code
                            };
                            const ctrl = new AbortController();
                            const to = setTimeout(() => ctrl.abort(), 30000);
                            let json;
                            try {
                                const res = await fetch(GAS_WEB_APP_URL, {
                                    method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },
                                    body: JSON.stringify(payload), signal: ctrl.signal
                                });
                                json = await res.json();
                            } finally { clearTimeout(to); }
                            
                            if (json && json.ok) {
                                removePending(entry.id);
                                if (typeof json.gx === "number" && typeof json.gy === "number") { entry.gx = json.gx; entry.gy = json.gy; }
                                snap.occupied.push(entry);
                                done++;
                                broadcastWallEntry(entry);
                            } else if (json && json.code === "EVENT_ENDED") {
                                removePending(entry.id);            // event closed before this uploaded
                                dropped++;
                            } else {
                                throw new Error((json && json.error) || "Upload failed");
                            }
                        }
                    } catch (err) {}
                    
                    uploading = false;
                    rebuildEntries();
                    setUploadUI();
                    
                    if (dropped) showToast(`${dropped} drawing${dropped === 1 ? "" : "s"} couldn't be posted because the event ended.`);
                    else if (done === total) { if (done > 0) showToast(`Uploaded ${done} drawing${done === 1 ? "" : "s"} ✓`); }
                    else showToast(`Uploaded ${done} of ${total}. The rest are still saved here.`);
                    
                    loadWallEntries({ autoPlay: false });
                }
                
                function setUploadUI() {
                    const n = pending.length;
                    const label = uploading ? "Uploading..." : `Upload (${n})`;
                    ["nav-upload-btn", "dock-upload-btn", "more-upload-btn", "focus-upload-btn"].forEach(id => {
                        const b = document.getElementById(id);
                        if (!b) return;
                        b.hidden = n === 0;
                        b.textContent = label;
                        b.disabled = uploading;
                    });
                    const badge = document.getElementById("nav-badge");
                    if (badge) {
                        badge.hidden = n === 0;
                        badge.textContent = n;
                    }
                    const st = document.getElementById("more-upload-status");
                    if (st) st.textContent = n === 0 ? "Nothing waiting" : `${n} drawing${n === 1 ? "" : "s"} saved on this device`;
                }
                
                function updateWallCount(extra = "") {
                    const n = wallEntries.length;
                    let txt = `${n} ${n === 1 ? "drawing" : "drawings"}`;
                    if (pending.length) txt += ` · ${pending.length} pending`;
                    const el = document.getElementById("wall-count");
                    if (el) el.textContent = txt + extra;
                }
                
                const sigOf = list => list.map(e => e.id).join("|");
                
                async function loadWallEntries({ autoPlay = true, manual = false, isLiveSync = false } = {}) {
                    if (loadingWall) return;
                    loadingWall = true;
                    const rbtn = document.getElementById("refresh-btn");
                    if (!isLiveSync) {
                        document.getElementById("wall-count").textContent = "Syncing...";
                        rbtn.disabled = true;
                    }
                    
                    try {
                        const evScope = evCode();
                        const list = await fetchServerEntries(evScope);
                        if (evScope !== evCode()) return;                 // user switched scope mid-request
                        const prevIds = new Set(serverEntries.map(e => e.id));
                        const newlyAdded = list.filter(e => !prevIds.has(e.id));
                        const changed = sigOf(list) !== sigOf(serverEntries);
                        
                        serverEntries = list;
                        lsSet(cacheKey(), list);
                        loadReactions();
                        rebuildEntries();
                        setUploadUI();
                        
                        if (document.getElementById("view-wall").classList.contains("active")) {
                            if (isLiveSync && newlyAdded.length > 0 && newlyAdded.length === list.length - prevIds.size) {
                                newlyAdded.forEach(entry => {
                                    const existingEl = document.querySelector(`.wall-tile[data-id="${CSS.escape(entry.id)}"]`);
                                    if (existingEl) existingEl.remove();
                                    createWallTile(entry, true, true);
                                });
                                if (!userMoved) fitWallToScreen();
                            } else if (changed) {
                                renderWall(autoPlay);
                                if (manual) showToast("Wall updated ✓");
                            } else {
                                updateWallCount();
                                if (manual) showToast("Already up to date");
                            }
                        }
                    } catch (err) {
                        if (!isLiveSync) {
                            updateWallCount(" · offline");
                            if (manual) showToast("Can't reach the server. Showing saved copy.");
                        }
                    } finally {
                        loadingWall = false;
                        rbtn.disabled = false;
                    }
                }
                
                function refreshWall() {
                    if (AUTO_UPLOAD && pending.length > 0 && navigator.onLine) uploadPending(false);
                    else loadWallEntries({ autoPlay: true, manual: true });
                }
                
                function layoutMonument() {
                    const monument = document.getElementById("center-monument");
                    monument.style.left = -CELL_SIZE + "px";
                    monument.style.top = -CELL_SIZE + "px";
                    monument.style.width = CELL_SIZE * 2 + "px";
                    monument.style.height = CELL_SIZE * 2 + "px";
                }
                
                const tileBitmapCache = new Map();
                const activeReplayAnims = new Map();
                let wallPaintRaf = 0;
                let batchReplayRaf = 0;
                
                function getCachedTileCanvas(entry) {
                    let cached = tileBitmapCache.get(entry.id);
                    if (cached) return cached;
                    const cvs = document.createElement("canvas");
                    cvs.width = 256;
                    cvs.height = 256;
                    const ctx = cvs.getContext("2d");
                    ctx.fillStyle = bgOf(entry.strokes);
                    ctx.fillRect(0, 0, 256, 256);
                    renderStrokesInstant(ctx, entry.strokes || [], 256, false);
                    tileBitmapCache.set(entry.id, cvs);
                    return cvs;
                }
                
                function paintWallViewport() {
                    wallPaintRaf = 0;
                    const wallCvs = document.getElementById("wall-canvas");
                    if (!wallCvs || !document.getElementById("view-wall").classList.contains("active")) return;
                    
                    const dpr = Math.min(window.devicePixelRatio || 1, 2);
                    const vw = wallViewport.clientWidth || window.innerWidth;
                    const vh = wallViewport.clientHeight || window.innerHeight;
                    const targetW = Math.round(vw * dpr);
                    const targetH = Math.round(vh * dpr);
                    if (wallCvs.width !== targetW || wallCvs.height !== targetH) {
                        wallCvs.width = targetW;
                        wallCvs.height = targetH;
                    }
                    
                    const ctx = wallCvs.getContext("2d");
                    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
                    ctx.clearRect(0, 0, vw, vh);
                    
                    if (window.curtainHold) return;
                    const showBorders = document.getElementById("opt-borders") && document.getElementById("opt-borders").checked;
                    const tileScreenSize = CELL_SIZE * scale;
                    
                    for (const entry of wallEntries) {
                        const sx = entry.gx * tileScreenSize + panX;
                        const sy = entry.gy * tileScreenSize + panY;
                        if (sx + tileScreenSize < -40 || sx > vw + 40 || sy + tileScreenSize < -40 || sy > vh + 40) continue;
                        
                        const replayCvs = activeReplayAnims.get(entry.id);
                        if (replayCvs) {
                            ctx.fillStyle = bgOf(entry.strokes);
                            ctx.fillRect(sx, sy, tileScreenSize, tileScreenSize);
                            ctx.drawImage(replayCvs, sx, sy, tileScreenSize, tileScreenSize);
                        } else {
                            const bmp = getCachedTileCanvas(entry);
                            ctx.drawImage(bmp, sx, sy, tileScreenSize, tileScreenSize);
                        }
                        
                        if (showBorders) {
                            ctx.strokeStyle = "#e2e8f0";
                            ctx.lineWidth = 1;
                            ctx.strokeRect(sx, sy, tileScreenSize, tileScreenSize);
                        }
                    }
                }
                
                function scheduleWallPaint() {
                    if (wallPaintRaf) return;
                    wallPaintRaf = requestAnimationFrame(paintWallViewport);
                }
                
                function startTileReplayOnWall(entry) {
                    startUnifiedWallReplay([entry]);
                }
                
                function createWallTile(entry, animate = false, isNewArrival = false) {
                    const stage = document.getElementById("wall-stage");
                    const tile = document.createElement("div");
                    tile.className = "wall-tile" + (entry._pending ? " pending" : "") + (isNewArrival ? " just-arrived" : "");
                    tile.dataset.id = entry.id;
                    tile.style.left = entry.gx * CELL_SIZE + "px";
                    tile.style.top = entry.gy * CELL_SIZE + "px";
                    tile.style.width = CELL_SIZE + "px";
                    tile.style.height = CELL_SIZE + "px";
                    
                    const tag = document.createElement("div");
                    tag.className = "wall-tile-tag";
                    tag.textContent = (entry.author || "Anonymous") + (entry._pending ? " · not uploaded" : "");
                    tile.appendChild(tag);
                    const pill = document.createElement("div");
                    pill.className = "wall-tile-react";
                    tile.appendChild(pill);
                    
                    tile.onclick = (e) => {
                        e.stopPropagation();
                        if (dragMoved) return;
                        openModal(entry);
                    };
                    
                    stage.appendChild(tile);
                    updateTilePill(entry.id);
                    updateMinimap();
                    
                    if (animate) startTileReplayOnWall(entry);
                    else {
                        getCachedTileCanvas(entry);
                        scheduleWallPaint();
                    }
                    
                    if (isNewArrival) setTimeout(() => tile.classList.remove("just-arrived"), 5000);
                    return null;
                }
                
                function renderWall(autoPlay = true) {
                    wallTileAnimators.forEach(a => a.cancel());
                    wallTileAnimators = [];
                    if (batchReplayRaf) {
                        cancelAnimationFrame(batchReplayRaf);
                        batchReplayRaf = 0;
                    }
                    activeReplayAnims.clear();
                    
                    const stage = document.getElementById("wall-stage");
                    stage.querySelectorAll(".wall-tile").forEach(el => el.remove());
                    
                    layoutMonument();
                    updateWallCount();
                    
                    if (!userMoved) fitWallToScreen();
                    else applyStageTransform();
                    
                    wallEntries.forEach((entry) => createWallTile(entry, false, false));
                    
                    if (autoPlay && wallEntries.length > 0) {
                        startUnifiedWallReplay(wallEntries);
                    } else {
                        scheduleWallPaint();
                    }
                }
                
                function replayAllDrawings() { renderWall(true); }
                
                function applyStageTransform() {
                    const stage = document.getElementById("wall-stage");
                    stage.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
                    stage.style.setProperty("--pill-s", Math.min(2.5, 1 / scale).toFixed(3));
                    stage.classList.toggle("far", scale < 0.28);
                    scheduleWallPaint();
                    updateMinimap();
                }
                
                function fitWallToScreen() {
                    const viewport = document.getElementById("wall-viewport");
                    const vw = viewport.clientWidth || window.innerWidth;
                    const vh = viewport.clientHeight || (window.innerHeight - 120);
                    
                    let minX = -CELL_SIZE, maxX = CELL_SIZE, minY = -CELL_SIZE, maxY = CELL_SIZE;
                    
                    for (const e of wallEntries) {
                        minX = Math.min(minX, e.gx * CELL_SIZE);
                        maxX = Math.max(maxX, (e.gx + 1) * CELL_SIZE);
                        minY = Math.min(minY, e.gy * CELL_SIZE);
                        maxY = Math.max(maxY, (e.gy + 1) * CELL_SIZE);
                    }
                    
                    const contentW = maxX - minX + 120;
                    const contentH = maxY - minY + 140;
                    
                    scale = Math.min(vw / contentW, vh / contentH, 1.15);
                    scale = Math.max(0.18, scale);
                    
                    const centerX = (minX + maxX) / 2;
                    const centerY = (minY + maxY) / 2;
                    
                    panX = vw / 2 - centerX * scale;
                    panY = vh / 2 - centerY * scale;
                    applyStageTransform();
                }
                
                function resetFit() {
                    userMoved = false;
                    fitWallToScreen();
                }
                
                function zoomWall(factor) {
                    userMoved = true;
                    const viewport = document.getElementById("wall-viewport");
                    const cx = viewport.clientWidth / 2;
                    const cy = viewport.clientHeight / 2;
                    
                    const newScale = Math.min(2.5, Math.max(0.15, scale * factor));
                    panX = cx - ((cx - panX) / scale) * newScale;
                    panY = cy - ((cy - panY) / scale) * newScale;
                    scale = newScale;
                    applyStageTransform();
                }
                
                window.addEventListener("resize", () => {
                    if (document.getElementById("view-wall").classList.contains("active") && !userMoved) fitWallToScreen();
                });
                
                const wallViewport = document.getElementById("wall-viewport");
                wallViewport.addEventListener("mousedown", (e) => {
                    isPanning = true;
                    dragMoved = false;
                    downX = e.clientX;
                    downY = e.clientY;
                    startPanX = e.clientX - panX;
                    startPanY = e.clientY - panY;
                });
                
                window.addEventListener("mousemove", (e) => {
                    if (!isPanning) return;
                    if (Math.hypot(e.clientX - downX, e.clientY - downY) > 5) {
                        dragMoved = true;
                        userMoved = true;
                    }
                    panX = e.clientX - startPanX;
                    panY = e.clientY - startPanY;
                    applyStageTransform();
                });
                
                window.addEventListener("mouseup", () => { isPanning = false; });
                
                wallViewport.addEventListener("wheel", (e) => {
                    e.preventDefault();
                    zoomWall(e.deltaY < 0 ? 1.12 : 0.89);
                }, { passive: false });
                
                let lastTouchDist = null;
                wallViewport.addEventListener("touchstart", (e) => {
                    if (e.touches.length === 1) {
                        isPanning = true;
                        dragMoved = false;
                        downX = e.touches[0].clientX;
                        downY = e.touches[0].clientY;
                        startPanX = e.touches[0].clientX - panX;
                        startPanY = e.touches[0].clientY - panY;
                    } else if (e.touches.length === 2) {
                        isPanning = false;
                        lastTouchDist = Math.hypot(
                            e.touches[0].clientX - e.touches[1].clientX,
                            e.touches[0].clientY - e.touches[1].clientY
                        );
                    }
                }, { passive: true });
                
                wallViewport.addEventListener("touchmove", (e) => {
                    if (e.touches.length === 1 && isPanning) {
                        if (Math.hypot(e.touches[0].clientX - downX, e.touches[0].clientY - downY) > 6) dragMoved = true;
                        userMoved = true;
                        panX = e.touches[0].clientX - startPanX;
                        panY = e.touches[0].clientY - startPanY;
                        applyStageTransform();
                    } else if (e.touches.length === 2 && lastTouchDist) {
                        const dist = Math.hypot(
                            e.touches[0].clientX - e.touches[1].clientX,
                            e.touches[0].clientY - e.touches[1].clientY
                        );
                        zoomWall(dist / lastTouchDist);
                        lastTouchDist = dist;
                    }
                }, { passive: true });
                
                wallViewport.addEventListener("touchend", () => {
                    isPanning = false;
                    lastTouchDist = null;
                });
                
                let modalAnim = null;
                let modalEntry = null;
                
                function openModal(entry) {
                    modalEntry = entry;
                    document.getElementById("modal-author").textContent = entry.author || "Anonymous";
                    document.querySelector(".modal-canvas-wrap").style.background = bgOf(entry.strokes);
                    document.getElementById("tile-modal").classList.add("open");
                    
                    const mCtx = document.getElementById("modal-canvas").getContext("2d", { willReadFrequently: true });
                    
                    const play = () => {
                        if (modalAnim) modalAnim.cancel();
                        modalAnim = animateStrokes(mCtx, entry.strokes || [], 500, 1);
                    };
                    
                    document.getElementById("modal-replay-btn").onclick = play;
                    const mList = entry.strokes || [];
                    const mName = "freedom-wall-" + (entry.id || Date.now()) + ".png";
                    const mMeta = { author: entry.author || "Anonymous", gx: entry.gx, gy: entry.gy };
                    document.getElementById("modal-save-btn").onclick = () => askConsent("Save as PNG?", `Download ${mMeta.author}'s drawing to this device as a PNG?`, () => exportStrokesPNG(mList, mName, mMeta), { okLabel: "Save PNG" });
                    document.getElementById("modal-share-btn").onclick = () => shareStrokesPNG(mList, mName, mMeta);
                    document.getElementById("modal-video-btn").onclick = () => askConsent("Record replay video?", `Record ${mMeta.author}'s drawing as a video and save it? This takes a few seconds.`, () => exportReplayVideo(mList, mName, { meta: mMeta }), { okLabel: "Record" });
                    updateReactBar();
                    loadReactions();
                    play();
                }
                
                function closeModal() {
                    if (modalAnim) modalAnim.cancel();
                    modalEntry = null;
                    document.getElementById("tile-modal").classList.remove("open");
                }
                
                window.addEventListener("keydown", (e) => {
                    if (e.key === "Escape") {
                        closeModal();
                        closeColorPicker();
                    }
                });
                
                function bgOf(list) {
                    const b = (list || []).find(s => s && s.k === "bg");
                    return b && /^#[0-9a-f]{6}$/i.test(b.c) ? b.c : "#ffffff";
                }
                function downloadBlob(blob, filename) {
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url; a.download = filename;
                    document.body.appendChild(a); a.click(); a.remove();
                    setTimeout(() => URL.revokeObjectURL(url), 3000);
                }
                let paperBg = "#ffffff";
                function getAllItems() {
                    const all = getAllFlattenedStrokes(false);
                    if (all.length && paperBg !== "#ffffff") all.unshift({ k: "bg", c: paperBg });
                    return all;
                }
                function currentAuthorName() {
                    const v = (document.getElementById("author-input").value || "").trim();
                    return v || (userProfile && !userProfile.anonymous && userProfile.name) || "";
                }
                
                const LS_VOTER = "fw_voter_v1";
                let voterId = lsGet(LS_VOTER, null);
                if (!voterId) { voterId = "v_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); lsSet(LS_VOTER, voterId); }
                const REACT_ICONS = { heart: "❤️", star: "⭐", fire: "🔥" };
                let reactions = {};
                let myReactions = {};
                const zeroCounts = () => ({ heart: 0, star: 0, fire: 0 });
                
                const reactPending = new Map();
                const reactTouched = {};
                
                function reactIdBusy(id, exceptKey) {
                    for (const k of reactPending.keys()) {
                        if (k !== exceptKey && k.startsWith(id + ":")) return true;
                    }
                    return false;
                }
                
                async function loadReactions() {
                    const startedAt = Date.now();
                    try {
                        const res = await fetch(`${GAS_WEB_APP_URL}?module=freedomwallreactions&voter=${encodeURIComponent(voterId)}&_t=${Date.now()}`);
                        const j = await res.json();
                        if (!j.ok) return;
                        const nextR = Object.assign({}, j.data || {});
                        const nextM = Object.assign({}, j.mine || {});
                        // keep local state for anything saved/being saved since this request began
                        Object.keys(reactions).forEach(id => {
                            if (reactIdBusy(id) || (reactTouched[id] || 0) >= startedAt) {
                                nextR[id] = reactions[id];
                                if (myReactions[id]) nextM[id] = myReactions[id];
                            }
                        });
                        reactions = nextR;
                        myReactions = nextM;
                        document.querySelectorAll(".wall-tile").forEach(t => updateTilePill(t.dataset.id));
                        if (modalEntry) updateReactBar();
                    } catch (e) {}
                }
                
                async function postReactionToggle(id, type) {
                    const cleanId = String(id || "").trim();
                    const cleanReaction = String(type || "").trim();
                    if (!cleanId || !cleanReaction) throw new Error("Missing entry ID or reaction.");
                    const res = await fetch(GAS_WEB_APP_URL, {
                        method: "POST",
                        headers: { "Content-Type": "text/plain;charset=utf-8" },
                        body: JSON.stringify({
                            action: "reactFreedomWall",
                            id: cleanId,
                            entryId: cleanId,
                            reaction: cleanReaction,
                            type: cleanReaction,
                            voter: voterId
                        })
                    });
                    const j = await res.json();
                    if (!j.ok) throw new Error(j.error || "failed");
                    return j;
                }
                
                async function toggleReaction(type) {
                    if (!modalEntry || modalEntry._pending) return;
                    if (!navigator.onLine) { showToast("Reactions need internet."); return; }
                    const id = modalEntry.id;
                    const key = id + ":" + type;
                    haptic(10);
                    
                    const counts = Object.assign(zeroCounts(), reactions[id]);
                    const mineList = (myReactions[id] || []).slice();
                    const wasOn = mineList.includes(type);
                    reactions[id] = Object.assign({}, counts, { [type]: Math.max(0, counts[type] + (wasOn ? -1 : 1)) });
                    myReactions[id] = wasOn ? mineList.filter(t => t !== type) : mineList.concat(type);
                    reactTouched[id] = Date.now();
                    updateReactBar(); updateTilePill(id);
                    
                    let st = reactPending.get(key);
                    if (st) { st.want = !wasOn; return; }
                    
                    st = { want: !wasOn, serverOn: wasOn };
                    reactPending.set(key, st);
                    let failed = false;
                    try {
                        for (let guard = 0; st.serverOn !== st.want && guard < 8; guard++) {
                            const j = await postReactionToggle(id, type);
                            const nowOn = typeof j.active === "boolean" ? j.active : !st.serverOn;
                            if (nowOn === st.serverOn) break;
                            st.serverOn = nowOn;
                            if (st.serverOn === st.want && j.counts) {
                                reactions[id] = reactIdBusy(id, key)
                                ? Object.assign({}, reactions[id], { [type]: j.counts[type] })
                                : Object.assign(zeroCounts(), j.counts);
                                const m = new Set(myReactions[id] || []);
                                if (st.serverOn) m.add(type); else m.delete(type);
                                myReactions[id] = [...m];
                                reactTouched[id] = Date.now();
                                updateReactBar(); updateTilePill(id);
                                if (wallChannel && wallChannel.state === "joined" && !reactIdBusy(id, key)) {
                                    wallChannel.send({ type: "broadcast", event: "reaction", payload: { id, counts: reactions[id] } });
                                }
                            }
                        }
                        if (st.serverOn !== st.want) failed = true;
                    } catch (e) {
                        failed = true;
                    } finally {
                        reactPending.delete(key);
                    }
                    
                    if (failed) {
                        showToast("Couldn't save reaction. Re-syncing…");
                        const m = new Set(myReactions[id] || []);
                        if (st.serverOn) m.add(type); else m.delete(type);
                        myReactions[id] = [...m];
                        reactTouched[id] = 0;
                        updateReactBar(); updateTilePill(id);
                        loadReactions();
                    }
                }
                
                function updateTilePill(id) {
                    const el = document.querySelector(`.wall-tile[data-id="${CSS.escape(id)}"] .wall-tile-react`);
                    if (!el) return;
                    const c = reactions[id] || zeroCounts();
                    const parts = Object.keys(REACT_ICONS).filter(k => c[k] > 0).map(k => `${REACT_ICONS[k]} ${c[k]}`);
                    el.textContent = parts.join("  ");
                    el.classList.toggle("has", parts.length > 0);
                }
                
                function updateReactBar() {
                    if (!modalEntry) return;
                    const c = reactions[modalEntry.id] || zeroCounts();
                    const mine = myReactions[modalEntry.id] || [];
                    document.querySelectorAll("#react-bar .react-btn").forEach(b => {
                        const k = b.dataset.r;
                        b.querySelector("span").textContent = c[k] || 0;
                        b.classList.toggle("on", mine.includes(k));
                        b.disabled = !!modalEntry._pending;
                    });
                }
                
                // =========================================================================
                // EVENTS
                // =========================================================================
                const evEl = id => document.getElementById(id);
                const LS_HOST = "fw_host_tokens_v1";
                function hostToken(code) { return (lsGet(LS_HOST, {}) || {})[code] || ""; }
                function setHostToken(code, tok) {
                    const m = lsGet(LS_HOST, {}) || {};
                    if (tok) m[code] = tok; else delete m[code];
                    lsSet(LS_HOST, m);
                }
                function isHost() { return !!curEvent && !!hostToken(curEvent.code); }
                
                function normCode(c) { return String(c || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8); }
                function evIsLive() { return !!curEvent && curEvent.status === "active" && Date.now() < curEvent.endTs; }
                function fmtLeft(ms) {
                    if (ms <= 0) return "ending…";
                    const m = Math.floor(ms / 60000), h = Math.floor(m / 60), d = Math.floor(h / 24);
                    if (d > 0) return `${d}d ${h % 24}h left`;
                    if (h > 0) return `${h}h ${m % 60}m left`;
                    return `${Math.max(1, m)}m left`;
                }
                async function gasPost(payload) {
                    const res = await fetch(GAS_WEB_APP_URL, {
                        method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(payload)
                    });
                    return res.json();
                }
                
                const EV_BADGE_SVG = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;margin-right:5px"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>';
                
                function esc(value) {
                    return String(value == null ? "" : value).replace(/[&<>"']/g, ch => ({
                        "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;"
                    })[ch]);
                }
                
                function applyEventUI() {
                    const inEv = !!curEvent;
                    const btn = evEl("event-btn");
                    if (btn) {
                        if (inEv) btn.innerHTML = EV_BADGE_SVG + esc(curEvent.code);
                        else btn.textContent = "Event";
                    }
                    
                    const pill = evEl("event-pill");
                    if (pill) {
                        pill.hidden = !inEv;
                        if (inEv) pill.textContent = curEvent.name.slice(0, 22) + " · " + (curEvent.status === "archived" ? "archived" : fmtLeft(curEvent.endTs - Date.now()));
                    }
                    const title = document.querySelector(".center-event-title");
                    const sub = document.querySelector(".center-event-sub");
                    if (title) {
                        title.textContent = inEv ? curEvent.name : "THE ARTcher";
                        title.style.fontSize = inEv && curEvent.name.length > 14 ? "18px" : "";
                    }
                    if (sub) sub.textContent = inEv ? "ARCHERSTUDIO · " + curEvent.code : (activeSeason ? activeSeason.sub : "ARCHERSTUDIO");
                    
                    const note = evEl("event-post-note");
                    if (note) note.textContent = inEv
                    ? (evIsLive() ? `Posting to event: ${curEvent.name}` : "This event has ended · posting is closed")
                    : "Posting to the main wall";
                    renderEventModal();
                }
                
                function renderEventModal() {
                    const box = evEl("event-current");
                    if (!box) return;
                    box.hidden = !curEvent;
                    if (curEvent) {
                        evEl("event-cur-name").textContent = curEvent.name;
                        evEl("event-cur-code").textContent = curEvent.code;
                        evEl("event-cur-left").textContent = (curEvent.status === "archived" ? "Archived · read-only" : fmtLeft(curEvent.endTs - Date.now())) + (isHost() ? " · You’re the host" : "");
                    }
                    const endBtn = evEl("event-end-btn");
                    if (endBtn) endBtn.hidden = !(curEvent && curEvent.status === "active" && isHost());
                }
                
                // swap the whole app between the main wall and an event
                function setScope(ev) {
                    curEvent = ev || null;
                    lsSet(LS_EVENT, curEvent);
                    serverEntries = lsGet(cacheKey(), []);
                    tileBitmapCache.clear();
                    loadingWall = false;
                    userMoved = false;
                    myTileCycleIdx = -1;
                    rebuildEntries();
                    setUploadUI();
                    applyEventUI();
                    if (currentView === "wall") renderWall(true);
                    loadWallEntries({ autoPlay: true, manual: false });
                }
                
                // called whenever the server reports the current event's status
                function noteEventMeta(meta) {
                    if (!curEvent || meta.code !== curEvent.code) return;
                    const wasLive = curEvent.status === "active";
                    curEvent = Object.assign({}, curEvent, meta);
                    lsSet(LS_EVENT, curEvent);
                    if (wasLive && meta.status === "archived") { setTimeout(() => leaveEvent(true), 0); return; }
                    applyEventUI();
                }
                
                async function joinEventByCode(raw) {
                    const code = normCode(raw);
                    if (code.length < 4) { showToast("Enter the event code."); return false; }
                    if (!navigator.onLine) { showToast("Joining needs internet."); return false; }
                    try {
                        const res = await fetch(`${GAS_WEB_APP_URL}?module=fwevent&code=${code}&_t=${Date.now()}`);
                        const j = await res.json();
                        if (!j.ok || !j.event) { showToast("No event with that code."); return false; }
                        setScope(j.event);
                        showToast(j.event.status === "archived" ? `Viewing archived event: ${j.event.name}` : `Joined ${j.event.name} 🎪`);
                        haptic(12);
                        return true;
                    } catch (e) {
                        showToast("Couldn't reach the server.");
                        return false;
                    }
                }
                
                function leaveEvent(auto) {
                    if (!curEvent) return;
                    const name = curEvent.name;
                    try { localStorage.removeItem(cacheKey()); } catch (e) {}
                    setScope(null);
                    closeEventModal();
                    showToast(auto ? `"${name}" has ended and was archived. Back to the main wall.` : "Back to the main wall");
                }
                
                function openEventModal() { renderEventModal(); evEl("event-modal").classList.add("open"); }
                function closeEventModal() { evEl("event-modal").classList.remove("open"); }
                
                async function submitJoinCode() {
                    const inp = evEl("event-code-input");
                    if (await joinEventByCode(inp.value)) { inp.value = ""; closeEventModal(); switchView("wall"); }
                }

                const qrScanState = { stream: null, detector: null, frame: 0, busy: false, processing: false, opening: false, lastScanAt: 0 };

                function setQRScanStatus(message) {
                    const status = evEl("qr-scan-status");
                    if (status) status.textContent = message;
                }

                function stopQRScanCamera() {
                    if (qrScanState.frame) cancelAnimationFrame(qrScanState.frame);
                    qrScanState.frame = 0;
                    qrScanState.detector = null;
                    if (qrScanState.stream) {
                        qrScanState.stream.getTracks().forEach(track => track.stop());
                        qrScanState.stream = null;
                    }
                    const video = evEl("qr-scan-video");
                    if (video) {
                        video.pause();
                        video.srcObject = null;
                        video.classList.remove("active");
                    }
                }

                function closeQRScanner() {
                    stopQRScanCamera();
                    const modal = evEl("qr-scan-modal");
                    if (modal) modal.classList.remove("open");
                }

                function openQRScanner(context) {
                    const modal = evEl("qr-scan-modal");
                    const input = evEl("qr-scan-input");
                    if (!modal) return;
                    if (input) input.value = "";
                    modal.classList.add("open");
                    setQRScanStatus(context === "team"
                        ? "Allow camera access and point it at a collaboration invite QR."
                        : "Allow camera access and point it at an event or collaboration invite QR.");
                    startQRScanner();
                }

                async function startQRScanner() {
                    if (qrScanState.opening || qrScanState.stream) return;
                    stopQRScanCamera();
                    const video = evEl("qr-scan-video");
                    if (!window.BarcodeDetector) {
                        setQRScanStatus("This browser cannot scan QR codes with its camera. Paste an invite link or enter an event code below.");
                        return;
                    }
                    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                        setQRScanStatus("Camera access requires a secure connection. Paste an invite link or enter an event code below.");
                        return;
                    }
                    qrScanState.opening = true;
                    try {
                        const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
                        const stream = await navigator.mediaDevices.getUserMedia({
                            video: { facingMode: { ideal: "environment" } },
                            audio: false
                        });
                        if (!evEl("qr-scan-modal").classList.contains("open")) {
                            stream.getTracks().forEach(track => track.stop());
                            return;
                        }
                        qrScanState.detector = detector;
                        qrScanState.stream = stream;
                        video.srcObject = stream;
                        video.classList.add("active");
                        await video.play();
                        setQRScanStatus("Scanning… hold the QR inside the camera view.");
                        scanQRFrame();
                    } catch (error) {
                        console.error("Unable to start the QR camera scanner.", error);
                        stopQRScanCamera();
                        if (error && error.name === "NotAllowedError") {
                            setQRScanStatus("Camera permission was denied. Allow camera access or paste the invite link below.");
                        } else if (error && error.name === "NotFoundError") {
                            setQRScanStatus("No camera was found. Paste the invite link or enter an event code below.");
                        } else {
                            setQRScanStatus("Couldn't start the camera. Check permissions or paste the invite link below.");
                        }
                    } finally {
                        qrScanState.opening = false;
                    }
                }

                function scanQRFrame() {
                    if (!qrScanState.detector || !qrScanState.stream) return;
                    qrScanState.frame = requestAnimationFrame(scanQRFrame);
                    const video = evEl("qr-scan-video");
                    const now = performance.now();
                    if (qrScanState.busy || video.readyState < 2 || now - qrScanState.lastScanAt < 200) return;
                    qrScanState.lastScanAt = now;
                    qrScanState.busy = true;
                    qrScanState.detector.detect(video).then(codes => {
                        const result = codes.find(code => code.rawValue);
                        if (result) {
                            stopQRScanCamera();
                            processScannedQR(result.rawValue);
                        }
                    }).catch(error => {
                        console.error("Unable to read a QR code from the camera.", error);
                        stopQRScanCamera();
                        setQRScanStatus("Couldn't read the QR. Restart the camera or paste the invite link below.");
                    }).finally(() => {
                        qrScanState.busy = false;
                    });
                }

                function parseScannedQR(value) {
                    const text = String(value || "").trim();
                    if (/^[a-f0-9]{32}$/i.test(text)) return { roomId: text.toLowerCase() };
                    if (/^[a-z0-9]{4,8}$/i.test(text)) return { eventCode: normCode(text), focus: false };
                    let url;
                    try { url = new URL(text); }
                    catch (error) { return null; }
                    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
                    const eventCode = normCode(url.searchParams.get("event"));
                    const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
                    const roomId = hash.get("collab") || url.searchParams.get("collab") || "";
                    if (roomId && !/^[a-f0-9]{32}$/i.test(roomId)) return null;
                    if ((!eventCode || eventCode.length < 4) && !roomId) return null;
                    return {
                        eventCode: eventCode.length >= 4 ? eventCode : "",
                        focus: url.searchParams.get("focus") === "1",
                        roomId: roomId.toLowerCase()
                    };
                }

                function setScannedEventInUrl(code, focus) {
                    const url = new URL(window.location.href);
                    url.searchParams.set("event", code);
                    if (focus) url.searchParams.set("focus", "1");
                    else url.searchParams.delete("focus");
                    history.replaceState(null, "", url.toString());
                }

                async function processScannedQR(value) {
                    if (qrScanState.processing) return false;
                    const invite = parseScannedQR(value);
                    if (!invite) {
                        setQRScanStatus("That QR isn't a recognized ARTcher event or collaboration invite.");
                        return false;
                    }
                    qrScanState.processing = true;
                    setQRScanStatus("Invite found. Opening it inside ARTcher…");
                    try {
                        if (invite.eventCode) {
                            const previousFocusRequest = focusLinkRequested;
                            focusLinkRequested = invite.focus;
                            const joined = await joinEventByCode(invite.eventCode);
                            if (!joined) {
                                focusLinkRequested = previousFocusRequest;
                                setQRScanStatus("Couldn't join that event. Check the code or connection and try again.");
                                return false;
                            }
                            setScannedEventInUrl(invite.eventCode, invite.focus);
                        }
                        closeEventModal();
                        if (invite.roomId) {
                            setCollabRoomInUrl(invite.roomId);
                            initializeCollaborationFromInvite();
                        } else {
                            switchView("wall");
                        }
                        closeQRScanner();
                        return true;
                    } catch (error) {
                        console.error("Unable to open the scanned ARTcher invite.", error);
                        setQRScanStatus("Couldn't open that invite. Try again or enter the event code manually.");
                        return false;
                    } finally {
                        qrScanState.processing = false;
                    }
                }

                async function submitScannedQR() {
                    const input = evEl("qr-scan-input");
                    if (!input || !input.value.trim()) {
                        setQRScanStatus("Enter an event code or paste an invite link.");
                        return;
                    }
                    stopQRScanCamera();
                    if (await processScannedQR(input.value)) input.value = "";
                }

                window.openQRScanner = openQRScanner;
                window.closeQRScanner = closeQRScanner;
                window.startQRScanner = startQRScanner;
                window.submitScannedQR = submitScannedQR;

                function copyTextSafe(text, okMsg, failMsg) {
                    if (navigator.clipboard && navigator.clipboard.writeText) {
                        return navigator.clipboard.writeText(text)
                        .then(() => { haptic(8); showToast(okMsg); })
                        .catch(() => showToast(failMsg));
                    }
                    try {
                        const ta = document.createElement("textarea");
                        ta.value = text;
                        ta.style.position = "fixed";
                        ta.style.opacity = "0";
                        document.body.appendChild(ta);
                        ta.select();
                        document.execCommand("copy");
                        document.body.removeChild(ta);
                        haptic(8);
                        showToast(okMsg);
                    } catch (e) {
                        showToast(failMsg);
                    }
                }
                
                function copyEventCode() {
                    if (!curEvent) return;
                    copyTextSafe(curEvent.code, "Event code copied: " + curEvent.code, "Code: " + curEvent.code);
                }
                const LS_EVENT_FOCUS = "fw_event_focus_v1";
                function isEventFocusEnabled(code) {
                    var settings = lsGet(LS_EVENT_FOCUS, {});
                    return !settings || typeof settings[code] !== "boolean" ? true : settings[code];
                }
                function onFocusModeSwitch(sw) {
                    if (!curEvent || !isHost()) {
                        sw.checked = curEvent ? isEventFocusEnabled(curEvent.code) : true;
                        return;
                    }
                    var settings = lsGet(LS_EVENT_FOCUS, {});
                    if (!settings || typeof settings !== "object" || Array.isArray(settings)) settings = {};
                    settings[curEvent.code] = !!sw.checked;
                    lsSet(LS_EVENT_FOCUS, settings);
                    showToast(sw.checked ? "Focus mode enabled for new invite links." : "Focus mode disabled for new invite links.");
                }
                window.onFocusModeSwitch = onFocusModeSwitch;
                function buildEventInviteUrl(code) {
                    var url = new URL(location.pathname, location.origin);
                    url.searchParams.set("event", code);
                    if (isEventFocusEnabled(code)) url.searchParams.set("focus", "1");
                    return url.toString();
                }
                function copyEventInvite() {
                    if (!curEvent) return;
                    var focusEnabled = isEventFocusEnabled(curEvent.code);
                    copyTextSafe(buildEventInviteUrl(curEvent.code), focusEnabled ? "Focus-mode invite link copied" : "Invite link copied", "Share this code: " + curEvent.code);
                }
                
                async function hostEvent() {
                    const name = evEl("event-name-input").value.trim();
                    const hours = Number(evEl("event-hours-select").value);
                    if (!name) { showToast("Give the event a name."); return; }
                    try {
                        const j = await gasPost({ action: "createFWEvent", name, hours, hidden: !!(evEl("event-start-hidden") && evEl("event-start-hidden").checked) });
                        if (!j.ok) { showToast(j.error || "Couldn't create the event."); return; }
                        setHostToken(j.event.code, j.hostToken);
                        evEl("event-name-input").value = "";
                        setScope(j.event);
                        showToast(`Event created · code ${j.event.code}`);
                    } catch (e) { showToast("Couldn't reach the server."); }
                }
                
                function endEventNow() {
                    if (!curEvent || !isHost()) { showToast("Only the host can end this event."); return; }
                    const code = curEvent.code, token = hostToken(code);
                    askConsent("End this event?", `"${curEvent.name}" will be archived now and everyone returns to the main wall.`, async () => {
                        try {
                            const j = await gasPost({ action: "endFWEvent", code, hostToken: token });
                            if (!j.ok) { showToast(j.error || "Couldn't end the event."); return; }
                            setHostToken(code, "");
                            leaveEvent(true);
                        } catch (e) { showToast("Couldn't reach the server."); }
                    }, { danger: true, okLabel: "End & archive" });
                }
                
                // countdown + gentle server check so clients notice the end without refreshing
                setInterval(() => { if (curEvent) applyEventUI(); }, 30000);
                setInterval(() => {
                    if (curEvent && curEvent.status === "active" && !document.hidden && navigator.onLine) {
                        loadWallEntries({ autoPlay: false, manual: false, isLiveSync: true });
                    }
                }, 60000);
                
                // ---------- wall search + My tile ----------
                const LS_MINE = "fw_mine_v1";
                let myTileIds = lsGet(LS_MINE, []);
                let searchState = { q: "", i: 0 };
                
                function focusTile(entry) {
                    const vw = wallViewport.clientWidth, vh = wallViewport.clientHeight;
                    userMoved = true;
                    scale = 1.2;
                    panX = vw / 2 - (entry.gx + 0.5) * CELL_SIZE * scale;
                    panY = vh / 2 - (entry.gy + 0.5) * CELL_SIZE * scale;
                    const stage = document.getElementById("wall-stage");
                    stage.classList.add("smooth");
                    applyStageTransform();
                    setTimeout(() => stage.classList.remove("smooth"), 650);
                    const el = document.querySelector(`.wall-tile[data-id="${CSS.escape(entry.id)}"]`);
                    if (el) { el.classList.add("just-arrived"); setTimeout(() => el.classList.remove("just-arrived"), 3000); }
                }
                
                function searchWall(e) {
                    if (e) e.preventDefault();
                    const input = document.getElementById("wall-search-input");
                    const q = input.value.trim().toLowerCase();
                    if (!q) return;
                    const matches = wallEntries
                    .filter(t => (t.author || "").toLowerCase().includes(q))
                    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
                    if (!matches.length) { showToast(`No artist matching "${q}"`); return; }
                    searchState.i = (q === searchState.q) ? searchState.i + 1 : 0;
                    searchState.q = q;
                    const hit = matches[searchState.i % matches.length];
                    focusTile(hit);
                    showToast(`${(searchState.i % matches.length) + 1} of ${matches.length} · ${hit.author || "Anonymous"}`);
                    input.blur();
                }
                
                let myTileCycleIdx = -1;
                let lastMyTileFocusId = null;
                
                function jumpToMyTile() {
                    const mine = wallEntries
                    .filter(t => myTileIds.includes(t.id))
                    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
                    if (!mine.length) { showToast("You haven't posted a tile on this device yet."); return; }
                    
                    myTileCycleIdx = (myTileCycleIdx + 1) % mine.length;
                    if (mine.length > 1 && mine[myTileCycleIdx].id === lastMyTileFocusId) {
                        myTileCycleIdx = (myTileCycleIdx + 1) % mine.length;
                    }
                    const target = mine[myTileCycleIdx];
                    lastMyTileFocusId = target.id;
                    focusTile(target);
                    if (mine.length > 1) {
                        showToast(`My tile ${myTileCycleIdx + 1} of ${mine.length} · ${target.author || "Anonymous"}`);
                    }
                }
                
                // ---------- minimap ----------
                const mm = document.getElementById("minimap");
                const mmCtx = mm.getContext("2d");
                let mmMap = null, mmDragging = false, mmRaf = 0;
                
                function updateMinimap() {
                    if (!minimapOn || mmRaf) return;
                    mmRaf = requestAnimationFrame(() => { mmRaf = 0; drawMinimap(); });
                }
                
                function drawMinimap() {
                    if (!document.getElementById("view-wall").classList.contains("active")) return;
                    const W = mm.width, H = mm.height, pad = 6;
                    const vw = wallViewport.clientWidth, vh = wallViewport.clientHeight;
                    const vx0 = -panX / scale, vy0 = -panY / scale, vx1 = (vw - panX) / scale, vy1 = (vh - panY) / scale;
                    
                    if (!mmDragging || !mmMap) {
                        let minX = Math.min(-CELL_SIZE, vx0), maxX = Math.max(CELL_SIZE, vx1);
                        let minY = Math.min(-CELL_SIZE, vy0), maxY = Math.max(CELL_SIZE, vy1);
                        for (const e of wallEntries) {
                            minX = Math.min(minX, e.gx * CELL_SIZE); maxX = Math.max(maxX, (e.gx + 1) * CELL_SIZE);
                            minY = Math.min(minY, e.gy * CELL_SIZE); maxY = Math.max(maxY, (e.gy + 1) * CELL_SIZE);
                        }
                        const k = Math.min((W - pad * 2) / (maxX - minX), (H - pad * 2) / (maxY - minY));
                        mmMap = { k, ox: (W - (maxX - minX) * k) / 2 - minX * k, oy: (H - (maxY - minY) * k) / 2 - minY * k };
                    }
                    const { k, ox, oy } = mmMap;
                    
                    mmCtx.clearRect(0, 0, W, H);
                    mmCtx.fillStyle = "rgba(29,78,216,.28)";
                    mmCtx.fillRect(ox - CELL_SIZE * k, oy - CELL_SIZE * k, CELL_SIZE * 2 * k, CELL_SIZE * 2 * k);
                    for (const e of wallEntries) {
                        mmCtx.fillStyle = myTileIds.includes(e.id) ? "#f59e0b" : "#94a3b8";
                        mmCtx.fillRect(ox + e.gx * CELL_SIZE * k, oy + e.gy * CELL_SIZE * k, Math.max(2, CELL_SIZE * k - 1), Math.max(2, CELL_SIZE * k - 1));
                    }
                    mmCtx.strokeStyle = "#1d4ed8"; mmCtx.lineWidth = 1.5;
                    mmCtx.strokeRect(ox + vx0 * k, oy + vy0 * k, (vx1 - vx0) * k, (vy1 - vy0) * k);
                }
                
                function mmJump(e) {
                    if (!mmMap) return;
                    const r = mm.getBoundingClientRect();
                    const px = (e.clientX - r.left) * (mm.width / r.width), py = (e.clientY - r.top) * (mm.height / r.height);
                    const wx = (px - mmMap.ox) / mmMap.k, wy = (py - mmMap.oy) / mmMap.k;
                    userMoved = true;
                    panX = wallViewport.clientWidth / 2 - wx * scale;
                    panY = wallViewport.clientHeight / 2 - wy * scale;
                    applyStageTransform();
                }
                mm.addEventListener("pointerdown", e => { e.stopPropagation(); mmDragging = true; mm.setPointerCapture(e.pointerId); mmJump(e); });
                mm.addEventListener("pointermove", e => { if (mmDragging) mmJump(e); });
                mm.addEventListener("pointerup", () => { mmDragging = false; updateMinimap(); });
                mm.addEventListener("pointercancel", () => { mmDragging = false; });
                
                // ---------- paper tint ----------
                const PAPERS = [["#ffffff", "White"], ["#fefce8", "Warm cream"], ["#eff6ff", "Blueprint"], ["#fdf2f8", "Soft pink"], ["#0f172a", "Dark slate"]];
                
                function setPaper(col, silent = false) {
                    const wasDark = paperBg === "#0f172a";
                    paperBg = col;
                    canvasStage.style.backgroundColor = col;
                    document.querySelectorAll(".paper-chip").forEach(b => b.classList.toggle("active", b.dataset.c === col));
                    if (col === "#0f172a" && currentColor.toLowerCase() === "#0f172a") selectColor("#ffffff", true);
                    else if (wasDark && col !== "#0f172a" && currentColor.toLowerCase() === "#ffffff") selectColor("#0f172a", false);
                    if (!silent) scheduleDraftSave();
                }
                
                // ---------- brush ring + eyedropper loupe ----------
                let brushRing = null;
                function updateBrushRing(e) {
                    if (!brushRing) return;
                    if (e.pointerType === "touch" || isPreviewing || currentTool === "hand") { brushRing.hidden = true; return; }
                    const r = canvasFrame.getBoundingClientRect();
                    let d = currentSize * frameUnit() * studioScale;
                    let fill = "transparent";
                    if (currentTool === "eyedropper") {
                        d = 28;
                        const [x, y] = getCanvasPoint(e);
                        const sp = samplePickColor(x, y);
                        fill = sp ? sp.hex : paperBg;
                    } else if (currentTool === "fill") {
                        d = 18;
                    }
                    d = Math.max(6, d);
                    Object.assign(brushRing.style, {
                        width: d + "px", height: d + "px",
                        left: (e.clientX - r.left) + "px", top: (e.clientY - r.top) + "px",
                        background: fill
                    });
                    brushRing.hidden = false;
                }
                
                function initUpgradeControls() {
                    const paperList = document.getElementById("paper-list");
                    PAPERS.forEach(([c, label], i) => {
                        const b = document.createElement("button");
                        b.type = "button"; b.className = "paper-chip" + (i === 0 ? " active" : "");
                        b.dataset.c = c; b.style.background = c; b.title = label; b.setAttribute("aria-label", "Paper " + label);
                        b.onclick = () => setPaper(c);
                        paperList.appendChild(b);
                    });
                    
                    
                    brushRing = document.createElement("div");
                    brushRing.className = "brush-ring";
                    brushRing.hidden = true;
                    canvasFrame.appendChild(brushRing);
                    drawCanvas.addEventListener("pointermove", updateBrushRing);
                    drawCanvas.addEventListener("pointerenter", updateBrushRing);
                    drawCanvas.addEventListener("pointerleave", () => { brushRing.hidden = true; });
                }
                
                // ---------- share + replay video ----------
                async function shareFile(blob, filename, meta = {}) {
                    const file = new File([blob], filename, { type: blob.type });
                    if (navigator.canShare && navigator.canShare({ files: [file] })) {
                        try {
                            await navigator.share({
                                files: [file],
                                title: "Freedom Wall",
                                text: meta.author ? `Drawn by ${meta.author} on the Freedom Wall` : "My Freedom Wall doodle",
                                url: currentWallShareUrl()
                            });
                        } catch (e) { if (e.name !== "AbortError") showToast("Couldn't open the share sheet."); }
                        return;
                    }
                    downloadBlob(blob, filename);
                    showToast("Sharing isn't supported here — saved instead.");
                }
                
                async function shareStrokesPNG(strokeList, filename, meta = {}) {
                    if (!strokeList.length) { showToast("Draw something first."); return; }
                    const blob = await exportStrokesPNG(strokeList, filename, Object.assign({}, meta, { asBlob: true }));
                    if (blob) shareFile(blob, filename, meta);
                }
                
                async function exportReplayVideo(strokeList, filename, opts = {}) {
                    const share = !!opts.share, meta = opts.meta || {}, size = opts.size || 720;
                    if (!strokeList.length) { showToast("Draw something first."); return; }
                    const mime = ["video/mp4;codecs=avc1", "video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"]
                    .find(t => window.MediaRecorder && MediaRecorder.isTypeSupported(t));
                    if (!mime || !HTMLCanvasElement.prototype.captureStream) { showToast("Video export isn't supported on this device."); return; }
                    
                    const bg = bgOf(strokeList);
                    const src = document.createElement("canvas"); src.width = src.height = size;
                    const out = document.createElement("canvas"); out.width = out.height = size;
                    const sctx = src.getContext("2d", { willReadFrequently: true });
                    const octx = out.getContext("2d");
                    const paint = () => { octx.fillStyle = bg; octx.fillRect(0, 0, size, size); octx.drawImage(src, 0, 0); };
                    
                    const stream = out.captureStream(30);
                    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 4000000 });
                    const chunks = [];
                    rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
                    const stopped = new Promise(r => { rec.onstop = r; });
                    
                    showToast("Recording replay…");
                    let raf; const loop = () => { paint(); raf = requestAnimationFrame(loop); };
                    paint(); rec.start(); loop();
                    
                    await new Promise(r => setTimeout(r, 400));
                    await new Promise(done => animateStrokes(sctx, strokeList, size, 0.6, done));
                    await new Promise(r => setTimeout(r, 1200));
                    
                    cancelAnimationFrame(raf); paint(); rec.stop(); await stopped;
                    stream.getTracks().forEach(t => t.stop());
                    
                    const ext = mime.startsWith("video/mp4") ? "mp4" : "webm";
                    const blob = new Blob(chunks, { type: mime.split(";")[0] });
                    const name = filename.replace(/\.\w+$/, "") + "." + ext;
                    if (share) shareFile(blob, name, meta); else { downloadBlob(blob, name); showToast("Replay video saved ✓"); }
                }
                
                function shareStudio() {
                    shareStrokesPNG(getAllItems(), "freedom-wall-drawing-" + Date.now() + ".png", { author: currentAuthorName() });
                }
                function videoStudio() {
                    exportReplayVideo(getAllItems(), "freedom-wall-replay-" + Date.now(), { meta: { author: currentAuthorName() } });
                }
                
                
                // =========================================================================
                // WEATHER STATE DECLARATIONS (Hoisted before Seasonal Engine)
                // =========================================================================
                const WEATHER_MODES = ["auto", "clear", "cloudy", "rain", "storm"];
                let weatherOverride = "auto";
                let liveWeatherState = { mode: "clear", temp: 29, label: "Clear" };
                let weatherParticles = [];
                let weatherSplashes = [];
                let weatherLightning = 0;
                let weatherRaf = null;
                
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
                        sub: "ARCHERSTUDIO",
                        accent: "#dc2626",
                        accentHover: "#b91c1c",
                        accentSoft: "#fef2f2",
                        particle: "snow",
                        colors: ["#dc2626", "#16a34a", "#eab308", "#991b1b"],
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
                    }
                };
                
                function getEasterSunday(year) {
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
                }
                
                let activeSeason = null;
                let seasonFxRaf = null;
                
                function getResolvedSeason() {
                    if (lsGet("fw_seasons_on_v1", true) === false) return null;
                    const raw = lsGet(LS_SEASON_OVERRIDE, "auto");
                    const override = (raw === "auto" || raw === "none" || SEASONS[raw]) ? raw : "auto";
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
                        
                    }
                    
                    applyProfileUI();
                    
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
                    const wMode = typeof getActiveWeatherMode === "function" ? getActiveWeatherMode() : "clear";
                    const isWetWeather = wMode === "rain" || wMode === "storm";
                    if (!activeSeason || !enabled || reduced || isWetWeather) return;
                    
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
                
                renderRadioStationList();
                // =========================================================================
                // OPTIONAL APK DOWNLOAD PROMPT (WEB BROWSER ONLY)
                // =========================================================================
                var weatherOn = true, minimapOn = true, weatherReady = false, weatherSyncStarted = false, weatherCoords = null;
                var shapeLock = false;
                var POST_WARN_MB = 0.19;
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
                    syncBrushControls();
                }
                function setShapeStroke(val) {
                    currentSize = clamp(Number(val) || 1, 1, 60);
                    syncBrushControls();
                    saveBrushPrefs();
                    applyStyleToSelectedShape();
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
                
                function estimatePayloadMB() {
                    const items = getAllFlattenedStrokes(false);
                    if (!items.length) return 0;
                    if (paperBg !== "#ffffff") items.unshift({ k: "bg", c: paperBg });
                    return (new Blob([JSON.stringify(items)]).size + 260) / 1048576;
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
                
                // =========================================================================
                // Wrappers call the original code whenever the bridge is absent.
                // =========================================================================
                var nativeRadioSig = "";
                var nativePaused = false;
                function hasNativeRadio() { return typeof window.AndroidRadio !== "undefined" && window.AndroidRadio !== null; }
                function hasNativeHaptic() { return typeof window.AndroidHaptic !== "undefined" && window.AndroidHaptic !== null; }
                
                function nativeSendStations() {
                    const list = radioStations.map(s => ({ name: s.name, url: s.url, country: s.country || "" }));
                    const sig = JSON.stringify(list);
                    if (sig !== nativeRadioSig) {
                        nativeRadioSig = sig;
                        window.AndroidRadio.setStations(sig);
                    }
                }
                function nativePlay(idx) {
                    nativeSendStations();
                    try { window.AndroidRadio.setVolume(Math.round(musicVolume * 100)); } catch (e) {}
                    window.AndroidRadio.play(idx);
                }
                
                // ---- play: HTML <audio> replaced by the native service ----
                const _origPlayCurrentStation = playCurrentStation;
                playCurrentStation = async function (attempt = 0) {
                    if (!hasNativeRadio()) return _origPlayCurrentStation.apply(this, arguments);
                    if (!musicPlaying) return;
                    const stations = await fetchLiveLofiStations();
                    if (!musicPlaying) return;
                    if (!stations.length) { startSynthFallback("Offline chill synth ♪"); return; }
                    stopSynthFallback();
                    if (radioAudio) { try { radioAudio.pause(); radioAudio.removeAttribute("src"); } catch (e) {} }
                    nativePaused = false;
                    nativePlay(currentStationIdx % stations.length);
                };
                
                // ---- stop (More-page row, topbar pill X, sleep timer) ----
                const _origToggleMusic = toggleMusic;
                toggleMusic = function () {
                    if (hasNativeRadio() && musicPlaying) { try { window.AndroidRadio.stop(); } catch (e) {} nativePaused = false; }
                    return _origToggleMusic.apply(this, arguments);
                };
                
                // ---- volume ----
                const _origSetMusicVolume = setMusicVolume;
                setMusicVolume = function (val) {
                    _origSetMusicVolume.apply(this, arguments);
                    if (hasNativeRadio()) { try { window.AndroidRadio.setVolume(Math.round(musicVolume * 100)); } catch (e) {} }
                };
                
                // ---- sleep timer: must run natively, JS timers freeze when the screen is off ----
                const _origSetRadioSleepTimer = setRadioSleepTimer;
                setRadioSleepTimer = function (minsStr) {
                    _origSetRadioSleepTimer.apply(this, arguments);
                    if (!hasNativeRadio()) return;
                    const mins = Number(minsStr) || 0;
                    clearTimeout(radioSleepTimer);
                    try { window.AndroidRadio.setSleepTimer(mins); } catch (e) {}
                };
                
                // ---- native -> web state (notification buttons, headset keys, errors) ----
                window.onNativeRadio = function (s) {
                    if (typeof s === "string") { try { s = JSON.parse(s); } catch (e) { return; } }
                    if (!s) return;
                    
                    let idx = s.name ? radioStations.findIndex(st => st.name === s.name) : -1;
                    if (idx < 0 && Number.isInteger(s.index) && s.index >= 0 && s.index < radioStations.length) idx = s.index;
                    if (idx >= 0) currentStationIdx = idx;
                    
                    if (typeof s.volume === "number") {
                        musicVolume = clamp(s.volume / 100, 0, 1);
                        const sl = document.getElementById("music-volume-slider");
                        const lb = document.getElementById("music-volume-val");
                        if (sl) sl.value = Math.round(musicVolume * 100);
                        if (lb) lb.textContent = Math.round(musicVolume * 100) + "%";
                        lsSet(LS_MUSIC_VOL, musicVolume);
                    }
                    
                    const st = radioStations[currentStationIdx];
                    const nm = st ? st.name : (s.name || "Radio");
                    const tag = st && st.country ? ` (${st.country})` : "";
                    
                    switch (s.state) {
                        case "buffering":
                        musicPlaying = true; nativePaused = false;
                        updateMuteIcon(`Connecting: ${nm}...`);
                        break;
                        case "playing":
                        musicPlaying = true; nativePaused = false;
                        stopSynthFallback();
                        updateMuteIcon(`Live: ${nm}${tag}`);
                        break;
                        case "paused":
                        musicPlaying = true; nativePaused = true;
                        updateMuteIcon(`Paused: ${nm}`);
                        break;
                        case "stopped":
                        musicPlaying = false; nativePaused = false;
                        stopSynthFallback();
                        updateMuteIcon();
                        break;
                        case "error":
                        showToast("Stream failed, trying the next station...");
                        break;
                    }
                    renderRadioStationList();
                };
                
                // ---- haptics: real vibration through the app ----
                const _origHaptic = haptic;
                var _nativeHapticAt = 0;
                haptic = function (ms = 8) {
                    if (!hasNativeHaptic()) return _origHaptic.apply(this, arguments);
                    if (typeof hapticOn !== "undefined" && !hapticOn) return;
                    const now = performance.now();
                    if (now - _nativeHapticAt < 35) return;
                    _nativeHapticAt = now;
                    try {
                        if (Array.isArray(ms)) window.AndroidHaptic.pattern(JSON.stringify(ms));
                        else window.AndroidHaptic.vibrate(Math.max(1, Math.min(200, Math.round(Number(ms)) || 8)));
                    } catch (e) { return _origHaptic.apply(this, arguments); }
                };
                
                // ---- app re-opened while the service is still playing ----
                try {
                    if (hasNativeRadio() && window.AndroidRadio.isPlaying()) {
                        musicPlaying = true;
                        updateMuteIcon("Live Radio Playing");
                        fetchLiveLofiStations();
                        if (typeof window.AndroidRadio.requestState === "function") window.AndroidRadio.requestState();
                    }
                } catch (e) {}
                
                // ---- wall reactions on/off ----
                var LS_WALL_REACT = "fw_wall_reactions_v1";
                function applyWallReactionsToggle(fromUser) {
                    const box = document.getElementById("opt-wall-reactions");
                    const stage = document.getElementById("wall-stage");
                    if (!box || !stage) return;
                    stage.classList.toggle("hide-reactions", !box.checked);
                    lsSet(LS_WALL_REACT, box.checked);
                    if (fromUser) {
                        if (typeof haptic === "function") haptic(6);
                        showToast(box.checked ? "Wall reactions shown" : "Wall reactions hidden");
                    }
                }
                (function () {
                    const box = document.getElementById("opt-wall-reactions");
                    if (box) { box.checked = lsGet(LS_WALL_REACT, true) !== false; applyWallReactionsToggle(false); }
                })();
                
                // =========================================================================
                // CONSENT DIALOGS + SEASONAL MASTER SWITCH
                // =========================================================================
                var RADIO_DOUBLE_TAP_MS = 2500;
                var _radioStartedAt = 0, _favAt = {};
                
                function askConsent(title, message, onOk, opts) {
                    opts = opts || {};
                    if (typeof confirmCriticalAction !== "function") { onOk(); return; }
                    if (pendingCriticalAction) return;                 // a dialog is already open
                    confirmCriticalAction(title, message, onOk);
                    const b = document.getElementById("confirm-continue");
                    if (b) {
                        b.textContent = opts.okLabel || "Continue";
                        b.classList.toggle("btn-danger", !!opts.danger);
                        b.classList.toggle("btn-accent", !opts.danger);
                    }
                    if (typeof haptic === "function") haptic(10);
                }
                
                // the shared dialog goes back to its default look after every use (Clear canvas relies on it)
                const _cancelCritical = cancelCriticalAction;
                cancelCriticalAction = function () {
                    _cancelCritical.apply(this, arguments);
                    const b = document.getElementById("confirm-continue");
                    if (b) { b.textContent = "Continue"; b.classList.add("btn-danger"); b.classList.remove("btn-accent"); }
                };
                
                // ---- saving / exporting ----
                const _saveStudioPNG = saveStudioPNG;
                saveStudioPNG = function () {
                    if (getAllFlattenedStrokes(false).length === 0) return _saveStudioPNG.apply(this, arguments);   // shows its own "draw something" toast
                    askConsent("Save as PNG?", "Your drawing will be downloaded to this device as a PNG image.", () => _saveStudioPNG(), { okLabel: "Save PNG" });
                };
                
                const _saveWallPNG = saveWallPNG;
                saveWallPNG = function () {
                    askConsent("Save the whole wall as PNG?", "This renders every tile into one 4K (3840 x 2160) image. It can take several seconds and use a lot of memory on older phones.",
                        () => _saveWallPNG(), { okLabel: "Save wall" });
                    };
                    
                    const _videoStudio = videoStudio;
                    videoStudio = function () {
                        if (getAllFlattenedStrokes(false).length === 0) return _videoStudio.apply(this, arguments);
                        askConsent("Record replay video?", "Your drawing is played back in real time and saved as a video. This takes a few seconds and the page must stay open.",
                            () => _videoStudio(), { okLabel: "Record" });
                        };
                        
                        // ---- layers ----
                        const _deleteLayerById = deleteLayerById;
                        deleteLayerById = function (id, e) {
                            if (e && e.stopPropagation) e.stopPropagation();
                            const lyr = layers.find(l => l.id === id);
                            if (!lyr) return;
                            const isText = lyr.type === "text";
                            const onlyDraw = !isText && layers.filter(l => l.type === "draw").length <= 1;
                            const detail = isText ? "text layer" : `${lyr.strokes.length} stroke${lyr.strokes.length === 1 ? "" : "s"}`;
                            askConsent(onlyDraw ? "Clear this layer?" : "Delete layer?",
                                `"${lyr.name}" (${detail}) will be ${onlyDraw ? "cleared" : "deleted"}. This can't be undone.`,
                                () => _deleteLayerById(id, null), { danger: true, okLabel: onlyDraw ? "Clear" : "Delete" });
                            };
                            
                            
                            const _removeRefImage = removeRefImage;
                            removeRefImage = function () {
                                if (!refState.loaded) return _removeRefImage.apply(this, arguments);
                                askConsent("Remove reference image?", "The tracing image is removed from this canvas. You'll need to upload it again to keep tracing.",
                                    () => _removeRefImage(), { danger: true, okLabel: "Remove" });
                                };
                                
                                const _toggleMusicConsent = toggleMusic;
                                toggleMusic = function () {
                                    const ev = window.event;
                                    const byUser = !!(ev && ev.isTrusted);           // sleep timer / native stop are not user taps
                                    if (!musicPlaying) { _radioStartedAt = performance.now(); return _toggleMusicConsent.apply(this, arguments); }
                                    if (byUser && performance.now() - _radioStartedAt < RADIO_DOUBLE_TAP_MS) {
                                        askConsent("Stop the radio?", "You tapped twice in a row. Stop the live radio?",
                                            () => _toggleMusicConsent(), { danger: true, okLabel: "Stop radio" });
                                            return;
                                        }
                                        return _toggleMusicConsent.apply(this, arguments);
                                    };
                                    
                                    const _toggleFavoriteConsent = toggleFavoriteRadio;
                                    toggleFavoriteRadio = function (station, e) {
                                        if (!station || !station.url) return _toggleFavoriteConsent.apply(this, arguments);
                                        const removing = isStationFavorite(station.url);
                                        const recent = performance.now() - (_favAt[station.url] || -1e9) < RADIO_DOUBLE_TAP_MS;
                                        if (removing && recent) {
                                            if (e && e.stopPropagation) e.stopPropagation();
                                            askConsent("Remove from favorites?", `"${station.name}" was just starred. Remove it from your favorite stations?`,
                                                () => { _favAt[station.url] = performance.now(); _toggleFavoriteConsent(station, null); }, { danger: true, okLabel: "Remove" });
                                                return;
                                            }
                                            _favAt[station.url] = performance.now();
                                            return _toggleFavoriteConsent.apply(this, arguments);
                                        };
                                        
                                        function seasonsEnabled() { return lsGet("fw_seasons_on_v1", true) !== false; }
                                        function syncSeasonCard() {
                                            const box = document.getElementById("opt-seasons");
                                            const card = document.getElementById("season-card");
                                            if (box) box.checked = seasonsEnabled();
                                            if (card) card.hidden = !seasonsEnabled();
                                        }
                                        function applySeasonsToggle(fromUser) {
                                            const box = document.getElementById("opt-seasons");
                                            if (box) lsSet("fw_seasons_on_v1", box.checked);
                                            syncSeasonCard();
                                            applySeasonalTheme();
                                            if (fromUser) {
                                                if (typeof haptic === "function") haptic(6);
                                                showToast(seasonsEnabled() ? "Seasonal events on" : "Seasonal events off");
                                            }
                                        }
                                        syncSeasonCard();
                                        
                                        
                                        var selectedShapeId = null;
                                        var shapeCounter = 0;
                                        var shapeEd = null;
                                        var shapeDrag = null;
                                        var previewHidden = false;
                                        var SHAPE_RESIZE_HANDLES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
                                        var SHAPE_HANDLE_POS = { nw: [0, 0], n: [0.5, 0], ne: [1, 0], e: [1, 0.5], se: [1, 1], s: [0.5, 1], sw: [0, 1], w: [0, 0.5] };
                                        
                                        function shapeLabel(kind) {
                                            const d = SHAPE_DEFS.find(s => s[0] === kind);
                                            return d ? d[1] : "Shape";
                                        }
                                        function shapeToStroke(sh) {
                                            let p = buildShapePoints(sh.kind, [sh.x0, sh.y0], [sh.x1, sh.y1], false);
                                            if (sh.r && sh.kind !== "line") {
                                                const cx = (sh.x0 + sh.x1) / 2, cy = (sh.y0 + sh.y1) / 2;
                                                const a = sh.r * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
                                                p = p.map(([x, y]) => {
                                                    const dx = x - cx, dy = y - cy;
                                                    return [Math.round(cx + dx * c - dy * s), Math.round(cy + dx * s + dy * c)];
                                                });
                                            }
                                            return {
                                                c: sh.c, s: sh.s, a: sh.a, sm: false,
                                                kind: sh.brushKind || "pen", al: !!sh.alphaLock,
                                                fl: !!sh.fl && sh.kind !== "line",
                                                p, shape: sh
                                            };
                                        }
                                        function refreshShapeLayer(lyr) {
                                            const stroke = shapeToStroke(lyr.shape);
                                            if (lyr.stroke) Object.assign(lyr.stroke, stroke);
                                            else lyr.strokes = [stroke];
                                        }
                                        function getShapeLayer(id) {
                                            const legacy = layers.find(l => l.id === id && l.shape);
                                            if (legacy) return legacy;
                                            for (const layer of layers) {
                                                if (!Array.isArray(layer.strokes)) continue;
                                                const stroke = layer.strokes.find(st => st.shape && st.shape.id === id);
                                                if (stroke) return { id, name: stroke.shape.name, type: "shape", shape: stroke.shape, stroke, layer, visible: layer.visible && !stroke.hidden };
                                            }
                                            return null;
                                        }
                                        function selectedShape() { return selectedShapeId ? getShapeLayer(selectedShapeId) : null; }
                                        function focusLayerId() {
                                            const shape = selectedShape();
                                            return shape && shape.layer ? shape.layer.id : shape ? shape.id : activeLayerId;
                                        }
                                        function shapeBounds(s) {
                                            return { L: Math.min(s.x0, s.x1), R: Math.max(s.x0, s.x1), T: Math.min(s.y0, s.y1), B: Math.max(s.y0, s.y1) };
                                        }
                                        function rotateShapePoint(pt, cx, cy, deg) {
                                            const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
                                            const dx = pt[0] - cx, dy = pt[1] - cy;
                                            return [cx + dx * c - dy * s, cy + dx * s + dy * c];
                                        }
                                        
                                        function shapeBoxFromDrag(kind, p0, p1, constrain) {
                                            const x0 = p0[0], y0 = p0[1];
                                            let x1 = p1[0], y1 = p1[1];
                                            if (constrain) {
                                                const dx = x1 - x0, dy = y1 - y0;
                                                if (kind === "line") {
                                                    const a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
                                                    const d = Math.hypot(dx, dy);
                                                    x1 = Math.round(x0 + Math.cos(a) * d);
                                                    y1 = Math.round(y0 + Math.sin(a) * d);
                                                } else {
                                                    const side = Math.max(Math.abs(dx), Math.abs(dy));
                                                    x1 = x0 + Math.sign(dx || 1) * side;
                                                    y1 = y0 + Math.sign(dy || 1) * side;
                                                }
                                            }
                                            return { x0, y0, x1, y1 };
                                        }
                                        
                                        function distToSegment(p, a, b) {
                                            const dx = b[0] - a[0], dy = b[1] - a[1], len2 = dx * dx + dy * dy;
                                            const t = len2 ? clamp(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2, 0, 1) : 0;
                                            return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
                                        }
                                        
                                        function pickShapeAt(pt) {
                                            const TOL = 10;
                                            for (let i = layers.length - 1; i >= 0; i--) {
                                                const lyr = layers[i];
                                                if (!lyr.visible || lyr.type !== "draw") continue;
                                                const shapes = lyr.shape
                                                ? [{ id: lyr.id, shape: lyr.shape }]
                                                : lyr.strokes.slice().reverse().filter(st => st.shape && !st.hidden).map(st => ({ id: st.shape.id, shape: st.shape }));
                                                for (const item of shapes) {
                                                    const s = item.shape, b = shapeBounds(s);
                                                    const q = s.r ? rotateShapePoint(pt, (s.x0 + s.x1) / 2, (s.y0 + s.y1) / 2, -s.r) : pt;
                                                    const hit = s.kind === "line"
                                                    ? distToSegment(pt, [s.x0, s.y0], [s.x1, s.y1]) <= TOL
                                                    : q[0] >= b.L - TOL && q[0] <= b.R + TOL && q[1] >= b.T - TOL && q[1] <= b.B + TOL;
                                                    if (hit) { selectShape(item.id); return; }
                                                }
                                            }
                                            selectShape(null);
                                        }
                                        
                                        function createShape(kind, p0, p1, constrain) {
                                            if (Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) < 4) { pickShapeAt(p1); return; }
                                            const box = shapeBoxFromDrag(kind, p0, p1, constrain);
                                            shapeCounter++;
                                            const shape = {
                                                id: "shape_" + Date.now() + "_" + Math.random().toString(36).slice(2, 5),
                                                name: shapeLabel(kind) + " " + shapeCounter,
                                                kind, x0: box.x0, y0: box.y0, x1: box.x1, y1: box.y1,
                                                c: currentColor, s: currentSize, a: currentOpacity,
                                                brushKind: currentBrushKind, alphaLock: !!getActiveDrawLayer().alphaLock,
                                                fl: shapeFilled && kind !== "line", r: 0
                                            };
                                            const layer = getActiveDrawLayer();
                                            layer.redoStack = [];
                                            layer.strokes.push(shapeToStroke(shape));
                                            selectShape(shape.id);
                                            scheduleDraftSave();
                                        }
                                        
                                        function selectShape(id) {
                                            const was = selectedShapeId;
                                            selectedShapeId = id && getShapeLayer(id) ? id : null;
                                            const lyr = selectedShape();
                                            if (lyr) {
                                                if (lyr.layer) activeLayerId = lyr.layer.id;
                                                deselectText();
                                                loadShapeStyleIntoControls(lyr.shape);
                                            }
                                            const row = document.getElementById("shape-sel-row");
                                            if (row) row.hidden = !lyr;
                                            updateShapeOverlay();
                                            if (was !== selectedShapeId) renderLayersPanel();
                                        }
                                        
                                        function deleteSelectedShape() {
                                            const shape = selectedShape();
                                            if (!shape) return;
                                            if (!shape.stroke) { deleteLayerById(shape.id); return; }
                                            askConsent("Delete shape?", `"${shape.shape.name}" will be removed from "${shape.layer.name}". This can't be undone.`,
                                                () => {
                                                    const index = shape.layer.strokes.indexOf(shape.stroke);
                                                    if (index < 0) return;
                                                    shape.layer.strokes.splice(index, 1);
                                                    shape.layer.redoStack = [];
                                                    selectShape(null);
                                                    redrawStudio();
                                                    updateHistoryUI();
                                                    renderLayersPanel();
                                                    scheduleDraftSave();
                                                    haptic(8);
                                                    showToast("Deleted " + shape.shape.name);
                                                }, { danger: true, okLabel: "Delete" });
                                        }
                                        
                                        function loadShapeStyleIntoControls(sh) {
                                            currentColor = sh.c;
                                            currentSize = sh.s;
                                            currentOpacity = sh.a;
                                            shapeFilled = !!sh.fl;
                                            const low = sh.c.toLowerCase();
                                            document.querySelectorAll(".swatch").forEach(el => el.classList.toggle("active", !!el.dataset.color && el.dataset.color.toLowerCase() === low));
                                            const pad = document.getElementById("color-pad-btn");
                                            const preset = COLORS.some(c => c.toLowerCase() === low);
                                            pad.classList.toggle("active", !preset);
                                            pad.style.background = preset ? "" : sh.c;
                                            document.querySelectorAll(".size-btn").forEach((b, i) => b.classList.toggle("active", SIZES[i] === sh.s));
                                            document.getElementById("opacity-slider").value = Math.round(sh.a * 100);
                                            document.getElementById("opacity-val").textContent = Math.round(sh.a * 100) + "%";
                                            document.querySelectorAll("#shape-fill-btn, .shape-fill-toggle").forEach(b => b.classList.toggle("active", shapeFilled));
                                            const grid = document.getElementById("shape-grid");
                                            if (grid) grid.classList.toggle("filled", shapeFilled);
                                            syncShapePane();
                                            renderSavedColorsUI();
                                        }
                                        
                                        function applyStyleToSelectedShape() {
                                            const lyr = selectedShape();
                                            if (!lyr) return;
                                            Object.assign(lyr.shape, { c: currentColor, s: currentSize, a: currentOpacity, fl: shapeFilled && lyr.shape.kind !== "line" });
                                            commitShapeEdit(lyr);
                                        }
                                        
                                        function commitShapeEdit(lyr) {
                                            refreshShapeLayer(lyr);
                                            scheduleStudioRedraw();
                                            updateShapeOverlay();
                                            scheduleDraftSave();
                                        }
                                        
                                        function updateShapeOverlay() {
                                            if (!shapeEd) return;
                                            shapeEd.style.setProperty("--zs", String(studioScale || 1));
                                            const lyr = selectedShape();
                                            if (!lyr || !lyr.visible || previewHidden || isPreviewing) { shapeEd.hidden = true; return; }
                                            const s = lyr.shape, b = shapeBounds(s), isLine = s.kind === "line";
                                            const pct = v => (v / 5) + "%";
                                            const put = (el, x, y) => { el.style.left = pct(clamp(x, 8, 492)); el.style.top = pct(clamp(y, 8, 492)); };
                                            shapeEd.hidden = false;
                                            Object.assign(shapeEd.box.style, { left: pct(b.L), top: pct(b.T), width: pct(b.R - b.L), height: pct(b.B - b.T) });
                                            SHAPE_RESIZE_HANDLES.forEach(k => {
                                                const h = shapeEd.handles[k];
                                                h.hidden = isLine;
                                                if (!isLine) put(h, b.L + SHAPE_HANDLE_POS[k][0] * (b.R - b.L), b.T + SHAPE_HANDLE_POS[k][1] * (b.B - b.T));
                                            });
                                            shapeEd.handles.p0.hidden = !isLine;
                                            shapeEd.handles.p1.hidden = !isLine;
                                            if (isLine) { put(shapeEd.handles.p0, s.x0, s.y0); put(shapeEd.handles.p1, s.x1, s.y1); }
                                            const small = (b.R - b.L) < 70 || (b.B - b.T) < 70;
                                            put(shapeEd.handles.move, (b.L + b.R) / 2, small ? b.B + 18 : (b.T + b.B) / 2);
                                        }
                                        
                                        function initShapeEditor() {
                                            if (shapeEd) return;
                                            shapeEd = document.createElement("div");
                                            shapeEd.className = "shape-edit";
                                            shapeEd.hidden = true;
                                            shapeEd.box = document.createElement("div");
                                            shapeEd.box.className = "shape-box";
                                            shapeEd.appendChild(shapeEd.box);
                                            shapeEd.handles = {};
                                            const add = (key, cls, label, text) => {
                                                const h = document.createElement("button");
                                                h.type = "button";
                                                h.className = "shape-h " + cls;
                                                h.setAttribute("aria-label", label);
                                                if (text) h.textContent = text;
                                                h.addEventListener("pointerdown", e => beginShapeDrag(e, key));
                                                h.addEventListener("touchstart", e => e.stopPropagation(), { passive: true });
                                                shapeEd.appendChild(h);
                                                shapeEd.handles[key] = h;
                                            };
                                            SHAPE_RESIZE_HANDLES.forEach(k => add(k, "h-" + k, "Resize shape"));
                                            add("p0", "h-pt", "Line start");
                                            add("p1", "h-pt", "Line end");
                                            add("move", "h-move", "Move shape", "\u2725");
                                            canvasStage.appendChild(shapeEd);
                                        }
                                        
                                        function beginShapeDrag(e, key) {
                                            const lyr = selectedShape();
                                            if (!lyr) return;
                                            e.preventDefault();
                                            e.stopPropagation();
                                            const target = e.currentTarget;
                                            try { target.setPointerCapture(e.pointerId); } catch (_) {}
                                            const s = lyr.shape;
                                            shapeDrag = {
                                                lyr, key, id: e.pointerId, start: getCanvasPoint(e),
                                                orig: { x0: s.x0, y0: s.y0, x1: s.x1, y1: s.y1 }, box: shapeBounds(s), r0: s.r || 0
                                            };
                                            const move = ev => {
                                                if (!shapeDrag || ev.pointerId !== shapeDrag.id) return;
                                                ev.preventDefault();
                                                applyShapeDrag(getCanvasPoint(ev));
                                            };
                                            const up = () => {
                                                target.removeEventListener("pointermove", move);
                                                target.removeEventListener("pointerup", up);
                                                target.removeEventListener("pointercancel", up);
                                                shapeDrag = null;
                                                scheduleDraftSave();
                                                haptic(6);
                                            };
                                            target.addEventListener("pointermove", move);
                                            target.addEventListener("pointerup", up);
                                            target.addEventListener("pointercancel", up);
                                        }
                                        
                                        function applyShapeDrag(pt) {
                                            const d = shapeDrag, s = d.lyr.shape, o = d.orig, k = d.key;
                                            const { L, R, T, B } = d.box;
                                            const MIN = 6;
                                            const r0 = d.r0 || 0, cx0 = (L + R) / 2, cy0 = (T + B) / 2;
                                            if (k === "rot") {
                                                let angle = Math.atan2(pt[1] - cy0, pt[0] - cx0) * 180 / Math.PI + 90;
                                                if (shapeLock || shiftPressed) angle = Math.round(angle / 15) * 15;
                                                else {
                                                    const snap = Math.round(angle / 45) * 45;
                                                    if (Math.abs(angle - snap) < 3) angle = snap;
                                                }
                                                s.r = ((Math.round(angle) % 360) + 360) % 360;
                                            } else if (k === "move") {
                                                const dx = clamp(pt[0] - d.start[0], -L, 500 - R);
                                                const dy = clamp(pt[1] - d.start[1], -T, 500 - B);
                                                s.x0 = o.x0 + dx; s.x1 = o.x1 + dx; s.y0 = o.y0 + dy; s.y1 = o.y1 + dy;
                                            } else if (k === "p0" || k === "p1") {
                                                let p = pt;
                                                const fixed = k === "p0" ? [o.x1, o.y1] : [o.x0, o.y0];
                                                if (shapeLock || shiftPressed) {
                                                    const snap = shapeBoxFromDrag("line", fixed, pt, true);
                                                    p = [snap.x1, snap.y1];
                                                }
                                                if (k === "p0") { s.x0 = p[0]; s.y0 = p[1]; } else { s.x1 = p[0]; s.y1 = p[1]; }
                                            } else {
                                                const q = r0 ? rotateShapePoint(pt, cx0, cy0, -r0) : pt;
                                                let l = L, r = R, t = T, b = B;
                                                if (k.includes("w")) l = Math.min(q[0], R - MIN);
                                                if (k.includes("e")) r = Math.max(q[0], L + MIN);
                                                if (k.includes("n")) t = Math.min(q[1], B - MIN);
                                                if (k.includes("s")) b = Math.max(q[1], T + MIN);
                                                if (k.length === 2 && (shapeLock || shiftPressed)) {
                                                    const ratio = (R - L) / Math.max(1, B - T);
                                                    const h = Math.max(MIN, (r - l) / ratio);
                                                    if (k.includes("n")) t = b - h; else b = t + h;
                                                }
                                                const center = r0
                                                ? rotateShapePoint([(l + r) / 2, (t + b) / 2], cx0, cy0, r0)
                                                : [(l + r) / 2, (t + b) / 2];
                                                const hw = (r - l) / 2, hh = (b - t) / 2;
                                                s.x0 = center[0] - hw; s.x1 = center[0] + hw;
                                                s.y0 = center[1] - hh; s.y1 = center[1] + hh;
                                            }
                                            s.x0 = Math.round(s.x0); s.y0 = Math.round(s.y0); s.x1 = Math.round(s.x1); s.y1 = Math.round(s.y1);
                                            commitShapeEdit(d.lyr);
                                        }
                                        
                                        // =========================================================================
                                        // TRACING OVERLAY (original picture drawn ABOVE the canvas; DOM only)
                                        // =========================================================================
                                        var refOverlayOn = true;
                                        
                                        function syncRefOverlay() {
                                            const layer = document.getElementById("ref-overlay-layer");
                                            const img = document.getElementById("ref-overlay-img");
                                            const base = document.getElementById("ref-img");
                                            if (!layer || !img || !base) return;
                                            const src = base.getAttribute("src") || "";
                                            if ((img.getAttribute("src") || "") !== src) {
                                                if (src) img.setAttribute("src", src); else img.removeAttribute("src");
                                            }
                                            const opacity = Number(document.getElementById("ref-overlay-opacity").value) / 100;
                                            document.getElementById("ref-overlay-val").textContent = Math.round(opacity * 100) + "%";
                                            img.style.opacity = opacity;
                                            img.style.filter = base.style.filter;
                                            img.style.transform = base.style.transform;
                                            layer.hidden = !(refState.loaded && refOverlayOn && !previewHidden);
                                            const quick = document.getElementById("ref-overlay-quick");
                                            if (quick) { quick.hidden = !refState.loaded; quick.classList.toggle("active", refOverlayOn); }
                                            const btn = document.getElementById("ref-overlay-btn");
                                            if (btn) btn.textContent = refOverlayOn ? "Overlay on top: On" : "Overlay on top: Off";
                                        }
                                        function updateRefOverlay() { syncRefOverlay(); scheduleReferenceDraftSave(); }
                                        function toggleRefOverlay() {
                                            refOverlayOn = !refOverlayOn;
                                            syncRefOverlay();
                                            scheduleReferenceDraftSave();
                                            haptic(6);
                                            showToast(refOverlayOn ? "Reference overlay shown" : "Reference overlay hidden");
                                        }
                                        
                                        function setPreviewOverlaysHidden(flag) {
                                            previewHidden = !!flag;
                                            syncRefOverlay();
                                            updateShapeOverlay();
                                        }
                                        
                                        (function initKeyboardAwareChrome() {
                                            const coarse = window.matchMedia("(pointer: coarse)");
                                            const vv = window.visualViewport;
                                            const NON_TEXT = /^(checkbox|radio|range|button|submit|reset|file|color|image)$/i;
                                            let editing = false, baseH = window.innerHeight, blurTimer = 0;
                                            
                                            const isEditable = el => !!el && (el.isContentEditable || el.tagName === "TEXTAREA" ||
                                                (el.tagName === "INPUT" && !NON_TEXT.test(el.type || "text")));
                                                
                                                function update() {
                                                    const h = vv ? vv.height : window.innerHeight;
                                                    if (!editing) baseH = Math.max(window.innerHeight, h);
                                                    const shrunk = baseH - h > 120;
                                                    document.body.classList.toggle("kb-open", coarse.matches && editing && (!vv || shrunk));
                                                }
                                                document.addEventListener("focusin", e => {
                                                    clearTimeout(blurTimer);
                                                    editing = isEditable(e.target);
                                                    update();
                                                    const box = editing && e.target.closest ? e.target.closest(".text-box") : null;
                                                    if (box) setTimeout(() => box.scrollIntoView({ block: "nearest", behavior: "smooth" }), 320);
                                                });
                                                document.addEventListener("focusout", () => {
                                                    clearTimeout(blurTimer);
                                                    blurTimer = setTimeout(() => { editing = isEditable(document.activeElement); update(); }, 120);
                                                });
                                                if (vv) vv.addEventListener("resize", update);
                                                window.addEventListener("resize", update);
                                                window.addEventListener("orientationchange", () => setTimeout(update, 300));
                                            })();
                                            
                                            const APK_DOWNLOAD_URL = "download/ARTcher-v1.11.apk";
                                            const LS_APK_DISMISSED = "fw_apk_prompt_dismissed_v1";
                                            
                                            function isRunningInsideAppOrPWA() {
                                                const ua = navigator.userAgent || "";
                                                const ref = document.referrer || "";
                                                const params = new URLSearchParams(window.location.search);
                                                
                                                const isAndroidWebView = /; wv\)/i.test(ua) || (/Android/i.test(ua) && /Version\/\d+\.\d+/i.test(ua));
                                                const isCustomWrapper = /ArcherFreedom|ARTcherApp|ArcherStudio/i.test(ua) || Boolean(window.AndroidInterface || window.ReactNativeWebView);
                                                const isAndroidReferrer = ref.startsWith("android-app://") || ref.startsWith("file://");
                                                const isEmbeddedIframe = (() => { try { return window.self !== window.top; } catch (e) { return true; } })();
                                                const hasAppParam = params.get("app") === "1" || params.get("source") === "apk";
                                                const isStandalone = (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || window.navigator.standalone === true;
                                                
                                                return isAndroidWebView || isCustomWrapper || isAndroidReferrer || isEmbeddedIframe || hasAppParam || isStandalone;
                                            }
                                            
                                            function initApkDownloadPrompt() {
                                                if (isRunningInsideAppOrPWA()) return;
                                                
                                                const promptCard = document.getElementById("apk-prompt-card");
                                                const moreApkCard = document.getElementById("more-apk-card");
                                                const promptLink = document.getElementById("apk-prompt-link");
                                                const moreLink = document.getElementById("more-apk-link");
                                                
                                                if (promptLink) promptLink.href = APK_DOWNLOAD_URL;
                                                if (moreLink) moreLink.href = APK_DOWNLOAD_URL;
                                                if (moreApkCard) moreApkCard.hidden = false;
                                                
                                                const dismissed = lsGet(LS_APK_DISMISSED, false);
                                                if (promptCard && !dismissed) {
                                                    promptCard.hidden = false;
                                                }
                                            }
                                            
                                            function dismissApkPrompt() {
                                                lsSet(LS_APK_DISMISSED, true);
                                                const promptCard = document.getElementById("apk-prompt-card");
                                                if (promptCard) promptCard.hidden = true;
                                                showToast("You can still download the APK anytime in More.");
                                            }
                                            
                                            function trackApkDownload() {
                                                haptic(10);
                                                showToast("Downloading Android APK…");
                                            }
                                            
                                            initApkDownloadPrompt();
                                            initUserProfile();
                                            applySeasonalTheme();
                                            loadOptions();
                                            initStudioControls();
                                            loadDraft();
                                            restoreReferenceDraft();
                                            initializeCollaborationFromInvite();
                                            preloadAllFonts();
                                            layoutMonument();
                                            applyStageTransform();
                                            setUploadUI();
                                            updateHistoryUI();
                                            syncUnit();
                                            loadWallEntries({ autoPlay: false, manual: false, isLiveSync: true });
                                            
                                            applyEventUI();
                                            const _qEv = new URLSearchParams(location.search).get("event");
                                            const _hasCollabInvite = new URLSearchParams(location.hash.replace(/^#/, "")).has("collab");
                                            if (_qEv) joinEventByCode(_qEv).then(ok => { if (ok && !_hasCollabInvite) switchView("wall"); });
                                            
                                            window.addEventListener("online", () => {
                                                if (AUTO_UPLOAD && pending.length > 0) uploadPending(true);
                                            });
                                            
                                            if (AUTO_UPLOAD && pending.length > 0 && navigator.onLine) {
                                                uploadPending(true);
                                            }
                                            
                                            // =========================================================================
                                            // AMBIENT & WEATHER-REACTIVE WALL EFFECTS (Open-Meteo + Live Preview)
                                            // =========================================================================
                                            
                                            function getActiveWeatherMode() {
                                                if (!weatherOn) return "clear";
                                                return weatherOverride === "auto" ? liveWeatherState.mode : weatherOverride;
                                            }
                                            
                                            function updateWeatherPillUI() {
                                                const el = document.getElementById("weather-pill-text");
                                                if (!el) return;
                                                const mode = getActiveWeatherMode();
                                                const icons = { clear: "☀️", cloudy: "☁️", rain: "🌧️", storm: "⛈️" };
                                                const names = { clear: "Clear", cloudy: "Cloudy", rain: "Rain", storm: "Storm" };
                                                const tag = weatherOverride === "auto" ? `${liveWeatherState.temp}°` : names[mode];
                                                if (el.parentElement) el.parentElement.title = `${liveWeatherState.temp}°C ${names[mode]} · Tap to preview weather effects`;
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
                                                            alpha: 0.05 + Math.random() * 0.04
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
                                                
                                                if (!window.__wxResize) { window.__wxResize = true; window.addEventListener("resize", rebuildWeatherParticles); }
                                                
                                                function tick() {
                                                    if (!weatherOn) { ctx.clearRect(0, 0, cvs.width, cvs.height); weatherRaf = null; return; }
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
                                                        // Cool overcast tint
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
                                            
                                            async function syncLiveWeather(lat = 14.569, lon = 121.132) {
                                                try {
                                                    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code`;
                                                    const res = await fetch(url);
                                                    const data = await res.json();
                                                    const code = data.current?.weather_code ?? 0;
                                                    const temp = Math.round(data.current?.temperature_2m ?? 29);
                                                    
                                                    let mode = "clear";
                                                    let label = "Clear";
                                                    if ([95, 96, 99].includes(code)) { mode = "storm"; label = "Storm"; }
                                                    else if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)) { mode = "rain"; label = "Rain"; }
                                                    else if ([1, 2, 3, 45, 48].includes(code)) { mode = "cloudy"; label = "Cloudy"; }
                                                    
                                                    liveWeatherState = { mode, temp, label };
                                                    rebuildWeatherParticles();
                                                    updateWeatherPillUI();
                                                } catch (e) {
                                                    updateWeatherPillUI();
                                                }
                                            }
                                            
                                            weatherReady = true;
                                            startWeatherEngine();
                                            initWeatherSync();
                                            
                                            function closeRadioPopover() {
                                                const p = document.getElementById("radio-pop"), b = document.getElementById("radio-chip-btn");
                                                if (p) p.hidden = true;
                                                if (b) b.setAttribute("aria-expanded", "false");
                                            }
                                            function toggleRadioPopover(e) {
                                                if (e) e.stopPropagation();
                                                const p = document.getElementById("radio-pop"), b = document.getElementById("radio-chip-btn");
                                                if (!p) return;
                                                p.hidden = !p.hidden;
                                                if (b) b.setAttribute("aria-expanded", String(!p.hidden));
                                            }
                                            document.addEventListener("pointerdown", (e) => {
                                                if (!e.target.closest("#radio-pop, #radio-chip-btn")) closeRadioPopover();
                                            });
                                            document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeRadioPopover(); });
                                            
                                            (function () {
                                                "use strict";
                                                
                                                function lbHearts(e) { return (reactions[e.id] && reactions[e.id].heart) || 0; }
                                                
                                                function lbTop() {
                                                    return wallEntries
                                                    .filter(e => !e._pending)
                                                    .slice()
                                                    .sort((a, b) => lbHearts(b) - lbHearts(a) || (b.timestamp || 0) - (a.timestamp || 0))
                                                    .slice(0, 10);
                                                }
                                                
                                                function lbActive() {
                                                    const v = document.getElementById("view-leaderboard");
                                                    return !!(v && v.classList.contains("active"));
                                                }
                                                
                                                function renderLeaderboard() {
                                                    const list = document.getElementById("lb-list");
                                                    if (!list) return;
                                                    list.replaceChildren();
                                                    const top = lbTop();
                                                    if (!top.length) {
                                                        const d = document.createElement("div");
                                                        d.className = "lb-empty";
                                                        d.textContent = "No drawings yet. Be the first to post!";
                                                        list.appendChild(d);
                                                        return;
                                                    }
                                                    top.forEach((entry, i) => {
                                                        const rank = i + 1;
                                                        const row = document.createElement("div");
                                                        row.className = "lb-row";
                                                        row.setAttribute("role", "button");
                                                        row.tabIndex = 0;
                                                        
                                                        const badge = document.createElement("span");
                                                        badge.className = "lb-rank" + (rank === 1 ? " gold" : rank === 2 ? " silver" : rank === 3 ? " bronze" : "");
                                                        badge.textContent = "#" + rank;
                                                        
                                                        const thumb = document.createElement("span");
                                                        thumb.className = "lb-thumb";
                                                        const cv = document.createElement("canvas");
                                                        cv.width = cv.height = 112;
                                                        const c = cv.getContext("2d", { willReadFrequently: true });
                                                        c.fillStyle = bgOf(entry.strokes);
                                                        c.fillRect(0, 0, 112, 112);
                                                        c.drawImage(getCachedTileCanvas(entry), 0, 0, 112, 112);
                                                        thumb.appendChild(cv);
                                                        
                                                        const info = document.createElement("span");
                                                        info.className = "lb-info";
                                                        const name = document.createElement("span");
                                                        name.className = "lb-name";
                                                        name.textContent = entry.author || "Anonymous";
                                                        const tile = document.createElement("span");
                                                        tile.className = "lb-tile";
                                                        tile.textContent = "Tile " + entry.gx + ", " + entry.gy;
                                                        info.appendChild(name);
                                                        info.appendChild(tile);
                                                        
                                                        const pill = document.createElement("span");
                                                        pill.className = "lb-heart";
                                                        pill.textContent = "❤️ " + lbHearts(entry);
                                                        
                                                        const loc = document.createElement("button");
                                                        loc.type = "button";
                                                        loc.className = "btn btn-sm";
                                                        loc.textContent = "Locate";
                                                        loc.title = "Locate on Wall";
                                                        loc.setAttribute("aria-label", "Locate " + (entry.author || "Anonymous") + " on wall");
                                                        loc.addEventListener("click", (ev) => {
                                                            ev.stopPropagation();
                                                            switchView("wall");
                                                            focusTile(entry);
                                                        });
                                                        
                                                        row.append(badge, thumb, info, pill, loc);
                                                        row.addEventListener("click", () => openModal(entry));
                                                        row.addEventListener("keydown", (ev) => {
                                                            if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); openModal(entry); }
                                                        });
                                                        list.appendChild(row);
                                                    });
                                                }
                                                window.renderLeaderboard = renderLeaderboard;
                                                
                                                let lbTimer = 0;
                                                function lbSoon() {
                                                    if (!lbActive()) return;
                                                    clearTimeout(lbTimer);
                                                    lbTimer = setTimeout(renderLeaderboard, 120);
                                                }
                                                
                                                const _switchView = switchView;
                                                switchView = function (name) {
                                                    _switchView(name);
                                                    if (name === "leaderboard") {
                                                        renderLeaderboard();
                                                        loadWallEntries({ autoPlay: false, manual: false, isLiveSync: true });
                                                    }
                                                };
                                                
                                                const _loadReactions = loadReactions;
                                                loadReactions = async function () {
                                                    const r = await _loadReactions.apply(this, arguments);
                                                    lbSoon();
                                                    return r;
                                                };
                                                
                                                const _toggleReaction = toggleReaction;
                                                toggleReaction = async function () {
                                                    const p = _toggleReaction.apply(this, arguments);
                                                    lbSoon();
                                                    const r = await p;
                                                    lbSoon();
                                                    return r;
                                                };
                                                
                                                const _loadWallEntries = loadWallEntries;
                                                loadWallEntries = async function () {
                                                    const r = await _loadWallEntries.apply(this, arguments);
                                                    lbSoon();
                                                    return r;
                                                };
                                                
                                                const _updateTilePill = updateTilePill;
                                                updateTilePill = function (id) {
                                                    _updateTilePill(id);
                                                    lbSoon();
                                                };
                                                
                                                // ======================================================================
                                                // 3. STAMP-ORDER ACCURACY CAPTCHA (with 15-min lockout after 5 fails)
                                                // ======================================================================
                                                const CAP_W = 320, CAP_H = 190, CAP_SIZE = 44, CAP_MAX_DIST = 34;
                                                const CAP_MAX_ATTEMPTS = 5, CAP_LOCK_MS = 15 * 60 * 1000;
                                                const LS_CAP_LOCK = "fw_cap_lock_v1";
                                                
                                                const CAP_DEF = {
                                                    brush:   { p: ["M12 19l7-7 3 3-7 7-3-3z", "M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"], c: "#1d4ed8" },
                                                    star:    { p: ["M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"], c: "#d97706" },
                                                    heart:   { p: ["M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"], c: "#dc2626" },
                                                    bolt:    { p: ["M13 2L3 14h9l-1 8 10-12h-9l1-8z"], c: "#7c3aed" },
                                                    palette: { p: ["M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.9 0 1.5-.7 1.5-1.5 0-.4-.2-.8-.4-1.1-.3-.3-.4-.7-.4-1.1 0-.8.7-1.5 1.5-1.5H16c3.3 0 6-2.7 6-6 0-4.9-4.5-8.8-10-8.8z"],
                                                        dots: [[13.5, 6.5], [17.5, 10.5], [8.5, 7.5], [6.5, 12.5]], c: "#16a34a" }
                                                    };
                                                    const CAP_KEYS = Object.keys(CAP_DEF);
                                                    const cap = { targets: [], icons: [], stamps: [], base: null, onOk: null, busy: false, timer: null };
                                                    const rnd = (a, b) => a + Math.random() * (b - a);
                                                    const shuffleArr = (arr) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
                                                    
                                                    function getCapLockState() {
                                                        try {
                                                            const raw = JSON.parse(localStorage.getItem(LS_CAP_LOCK) || "null");
                                                            if (!raw) return { fails: 0, until: 0 };
                                                            if (raw.until && Date.now() >= raw.until) {
                                                                localStorage.removeItem(LS_CAP_LOCK);
                                                                return { fails: 0, until: 0 };
                                                            }
                                                            return { fails: Number(raw.fails) || 0, until: Number(raw.until) || 0 };
                                                        } catch (e) { return { fails: 0, until: 0 }; }
                                                    }
                                                    
                                                    function saveCapLockState(state) {
                                                        try { localStorage.setItem(LS_CAP_LOCK, JSON.stringify(state)); } catch (e) {}
                                                    }
                                                    
                                                    function capDrawIcon(ctx, key, x, y, size, rot, alpha) {
                                                        const d = CAP_DEF[key];
                                                        ctx.save();
                                                        ctx.globalAlpha = alpha == null ? 1 : alpha;
                                                        ctx.translate(x, y);
                                                        ctx.rotate(rot || 0);
                                                        const s = size / 24;
                                                        ctx.scale(s, s);
                                                        ctx.translate(-12, -12);
                                                        ctx.lineWidth = 2.1;
                                                        ctx.lineJoin = "round";
                                                        ctx.lineCap = "round";
                                                        ctx.strokeStyle = d.c;
                                                        ctx.fillStyle = d.c + "38";
                                                        d.p.forEach(str => { const P = new Path2D(str); ctx.fill(P); ctx.stroke(P); });
                                                        if (d.dots) { ctx.fillStyle = d.c; d.dots.forEach(([dx, dy]) => { ctx.beginPath(); ctx.arc(dx, dy, 1.5, 0, Math.PI * 2); ctx.fill(); }); }
                                                        ctx.restore();
                                                    }
                                                    
                                                    function capLayout() {
                                                        const pad = CAP_SIZE / 2 + 12, minDist = CAP_SIZE + 22;
                                                        const pts = [];
                                                        CAP_KEYS.forEach(() => {
                                                            let p = null;
                                                            for (let t = 0; t < 400 && !p; t++) {
                                                                const c = { x: rnd(pad, CAP_W - pad), y: rnd(pad, CAP_H - pad) };
                                                                if (pts.every(q => Math.hypot(q.x - c.x, q.y - c.y) >= minDist)) p = c;
                                                            }
                                                            if (!p) {
                                                                const i = pts.length;
                                                                p = { x: pad + (i % 3) * ((CAP_W - pad * 2) / 2), y: pad + Math.floor(i / 3) * (CAP_H - pad * 2) };
                                                            }
                                                            pts.push(p);
                                                        });
                                                        const keys = shuffleArr(CAP_KEYS);
                                                        return keys.map((k, i) => ({
                                                            key: k,
                                                            x: pts[i].x,
                                                            y: pts[i].y,
                                                            size: CAP_SIZE + rnd(-3, 3),
                                                            rot: rnd(-0.55, 0.55)
                                                        }));
                                                    }
                                                    
                                                    function capBuildBase() {
                                                        const b = document.createElement("canvas");
                                                        b.width = CAP_W; b.height = CAP_H;
                                                        const c = b.getContext("2d");
                                                        c.fillStyle = "#f8fafc";
                                                        c.fillRect(0, 0, CAP_W, CAP_H);
                                                        c.strokeStyle = "rgba(148,163,184,.32)";
                                                        c.lineWidth = 1;
                                                        const off = rnd(0, 18);
                                                        for (let x = off; x < CAP_W; x += 18) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x + rnd(-4, 4), CAP_H); c.stroke(); }
                                                        for (let y = off; y < CAP_H; y += 18) { c.beginPath(); c.moveTo(0, y); c.lineTo(CAP_W, y + rnd(-4, 4)); c.stroke(); }
                                                        const cols = ["#94a3b8", "#60a5fa", "#f472b6", "#fbbf24", "#34d399", "#a78bfa"];
                                                        for (let i = 0; i < 110; i++) {
                                                            c.fillStyle = cols[i % cols.length] + "66";
                                                            c.beginPath(); c.arc(rnd(0, CAP_W), rnd(0, CAP_H), rnd(0.8, 2.3), 0, Math.PI * 2); c.fill();
                                                        }
                                                        for (let i = 0; i < 10; i++) {
                                                            c.strokeStyle = cols[i % cols.length] + "88";
                                                            c.lineWidth = rnd(1.2, 2.2);
                                                            c.beginPath();
                                                            c.moveTo(rnd(0, CAP_W), rnd(0, CAP_H));
                                                            c.bezierCurveTo(rnd(0, CAP_W), rnd(0, CAP_H), rnd(0, CAP_W), rnd(0, CAP_H), rnd(0, CAP_W), rnd(0, CAP_H));
                                                            c.stroke();
                                                        }
                                                        for (let i = 0; i < 12; i++) {
                                                            capDrawIcon(c, CAP_KEYS[i % CAP_KEYS.length], rnd(0, CAP_W), rnd(0, CAP_H), rnd(14, 22), rnd(-3, 3), 0.22);
                                                        }
                                                        return b;
                                                    }
                                                    
                                                    function capDrawStamp(ctx, x, y, num) {
                                                        ctx.save();
                                                        // High-contrast outer halo + solid navy pin badge
                                                        ctx.shadowColor = "rgba(15, 23, 42, 0.38)";
                                                        ctx.shadowBlur = 6;
                                                        ctx.shadowOffsetY = 2;
                                                        
                                                        // Outer target ring
                                                        ctx.strokeStyle = "#0f172a";
                                                        ctx.lineWidth = 2.5;
                                                        ctx.fillStyle = "rgba(29, 78, 216, 0.22)";
                                                        ctx.beginPath();
                                                        ctx.arc(x, y, 17, 0, Math.PI * 2);
                                                        ctx.fill();
                                                        ctx.stroke();
                                                        
                                                        // Solid white border + deep navy badge
                                                        ctx.shadowBlur = 0;
                                                        ctx.shadowOffsetY = 0;
                                                        ctx.fillStyle = "#0f172a";
                                                        ctx.strokeStyle = "#ffffff";
                                                        ctx.lineWidth = 2.5;
                                                        ctx.beginPath();
                                                        ctx.arc(x, y, 12, 0, Math.PI * 2);
                                                        ctx.fill();
                                                        ctx.stroke();
                                                        
                                                        // Bold step number
                                                        ctx.fillStyle = "#ffffff";
                                                        ctx.font = "800 12px Inter, sans-serif";
                                                        ctx.textAlign = "center";
                                                        ctx.textBaseline = "middle";
                                                        ctx.fillText(String(num), x, y + 0.5);
                                                        ctx.restore();
                                                    }
                                                    
                                                    function capRedraw() {
                                                        const cv = document.getElementById("captcha-canvas");
                                                        const c = cv.getContext("2d");
                                                        c.clearRect(0, 0, CAP_W, CAP_H);
                                                        c.drawImage(cap.base, 0, 0);
                                                        cap.icons.forEach(ic => capDrawIcon(c, ic.key, ic.x, ic.y, ic.size, ic.rot, 1));
                                                        
                                                        // Draw bold numbered stamps where the user tapped
                                                        cap.stamps.forEach((st, idx) => {
                                                            capDrawStamp(c, st.x, st.y, idx + 1);
                                                        });
                                                    }
                                                    
                                                    function capBuildStrip() {
                                                        const strip = document.getElementById("captcha-target-order");
                                                        strip.replaceChildren();
                                                        cap.targets.forEach((key, i) => {
                                                            if (i > 0) { const a = document.createElement("span"); a.className = "cap-arrow"; a.textContent = "→"; strip.appendChild(a); }
                                                            const step = document.createElement("div");
                                                            step.className = "cap-step";
                                                            const cv = document.createElement("canvas");
                                                            cv.width = cv.height = 72;
                                                            capDrawIcon(cv.getContext("2d"), key, 36, 36, 56, rnd(-0.2, 0.2), 1);
                                                            const n = document.createElement("b");
                                                            n.textContent = String(i + 1);
                                                            step.append(cv, n);
                                                            strip.appendChild(step);
                                                        });
                                                    }
                                                    
                                                    function capMsg(text, ok) {
                                                        const m = document.getElementById("captcha-msg");
                                                        m.textContent = text || "";
                                                        m.classList.toggle("ok", !!ok);
                                                    }
                                                    
                                                    function capSyncLockUI() {
                                                        clearInterval(cap.timer);
                                                        const lock = getCapLockState();
                                                        const sub = document.getElementById("captcha-submit");
                                                        if (lock.until && Date.now() < lock.until) {
                                                            cap.busy = true;
                                                            if (sub) sub.disabled = true;
                                                            const tick = () => {
                                                                const left = Math.max(0, lock.until - Date.now());
                                                                if (left <= 0) {
                                                                    clearInterval(cap.timer);
                                                                    localStorage.removeItem(LS_CAP_LOCK);
                                                                    cap.busy = false;
                                                                    if (sub) sub.disabled = false;
                                                                    capReset();
                                                                    return;
                                                                }
                                                                const mm = String(Math.floor(left / 60000)).padStart(2, "0");
                                                                const ss = String(Math.floor((left % 60000) / 1000)).padStart(2, "0");
                                                                capMsg("Too many failed attempts. Locked for " + mm + ":" + ss, false);
                                                            };
                                                            tick();
                                                            cap.timer = setInterval(tick, 1000);
                                                            return true;
                                                        }
                                                        if (sub) sub.disabled = false;
                                                        return false;
                                                    }
                                                    
                                                    function capReset() {
                                                        if (capSyncLockUI()) return;
                                                        const count = 4;
                                                        cap.targets = shuffleArr(CAP_KEYS).slice(0, count);
                                                        cap.icons = capLayout();
                                                        cap.stamps = [];
                                                        cap.base = capBuildBase();
                                                        cap.busy = false;
                                                        capBuildStrip();
                                                        capRedraw();
                                                        const st = getCapLockState();
                                                        const rem = CAP_MAX_ATTEMPTS - st.fails;
                                                        capMsg(
                                                            st.fails > 0
                                                            ? "Stamp the " + count + " icons in order (" + rem + " attempt" + (rem === 1 ? "" : "s") + " left)."
                                                            : "Stamp the " + count + " icons in the order shown (tap a stamp to undo).",
                                                            false
                                                        );
                                                    }
                                                    
                                                    function capIsOpen() { return document.getElementById("captcha-modal").classList.contains("open"); }
                                                    
                                                    window.openCaptcha = function (onOk) {
                                                        if (capIsOpen()) return;
                                                        cap.onOk = onOk;
                                                        capReset();
                                                        document.getElementById("captcha-modal").classList.add("open");
                                                    };
                                                    window.closeCaptcha = function () {
                                                        clearInterval(cap.timer);
                                                        document.getElementById("captcha-modal").classList.remove("open");
                                                        cap.onOk = null;
                                                    };
                                                    window.capShuffle = function () {
                                                        if (!cap.busy && !capSyncLockUI()) { haptic(6); capReset(); }
                                                    };
                                                    
                                                    function capComputeAccuracy() {
                                                        if (cap.stamps.length !== cap.targets.length) return 0;
                                                        let totalScore = 0;
                                                        for (let i = 0; i < cap.targets.length; i++) {
                                                            const expectedKey = cap.targets[i];
                                                            const targetIcon = cap.icons.find(ic => ic.key === expectedKey);
                                                            const stamp = cap.stamps[i];
                                                            if (!targetIcon || !stamp) continue;
                                                            
                                                            // Check nearest actual icon to ensure the user didn't stamp a different icon
                                                            let nearestKey = null, nearestDist = Infinity;
                                                            cap.icons.forEach(ic => {
                                                                const d = Math.hypot(ic.x - stamp.x, ic.y - stamp.y);
                                                                if (d < nearestDist) { nearestDist = d; nearestKey = ic.key; }
                                                            });
                                                            
                                                            const dist = Math.hypot(targetIcon.x - stamp.x, targetIcon.y - stamp.y);
                                                            if (nearestKey !== expectedKey || dist > CAP_MAX_DIST) {
                                                                totalScore += 0;
                                                            } else {
                                                                // 100% at dead center, scales down smoothly to 65% at edge of target
                                                                const precision = 1 - (dist / CAP_MAX_DIST) * 0.35;
                                                                totalScore += precision * 100;
                                                            }
                                                        }
                                                        return Math.round(totalScore / cap.targets.length);
                                                    }
                                                    
                                                    window.capSubmit = function () {
                                                        if (cap.busy || capSyncLockUI()) return;
                                                        if (cap.stamps.length !== cap.targets.length) {
                                                            capMsg("Place all " + cap.targets.length + " stamps first (" + cap.stamps.length + "/" + cap.targets.length + ").", false);
                                                            return;
                                                        }
                                                        
                                                        const accuracy = capComputeAccuracy();
                                                        if (accuracy >= 75) {
                                                            localStorage.removeItem(LS_CAP_LOCK);
                                                            cap.busy = true;
                                                            haptic(14);
                                                            capMsg("Accuracy: " + accuracy + "% — Passed!", true);
                                                            const fn = cap.onOk;
                                                            setTimeout(() => {
                                                                window.closeCaptcha();
                                                                if (typeof fn === "function") fn();
                                                            }, 420);
                                                        } else {
                                                            const st = getCapLockState();
                                                            const nextFails = st.fails + 1;
                                                            if (nextFails >= CAP_MAX_ATTEMPTS) {
                                                                saveCapLockState({ fails: nextFails, until: Date.now() + CAP_LOCK_MS });
                                                                haptic(35);
                                                                const wrap = document.getElementById("captcha-wrap");
                                                                wrap.classList.add("shake");
                                                                setTimeout(() => { wrap.classList.remove("shake"); capSyncLockUI(); }, 440);
                                                                return;
                                                            }
                                                            saveCapLockState({ fails: nextFails, until: 0 });
                                                            cap.busy = true;
                                                            haptic(25);
                                                            const rem = CAP_MAX_ATTEMPTS - nextFails;
                                                            capMsg("Accuracy: " + accuracy + "% (need 75%+). " + rem + " attempt" + (rem === 1 ? "" : "s") + " left.", false);
                                                            const wrap = document.getElementById("captcha-wrap");
                                                            wrap.classList.add("shake");
                                                            setTimeout(() => { wrap.classList.remove("shake"); capReset(); }, 950);
                                                        }
                                                    };
                                                    
                                                    function capTap(e) {
                                                        if (cap.busy || capSyncLockUI()) return;
                                                        const cv = document.getElementById("captcha-canvas");
                                                        const r = cv.getBoundingClientRect();
                                                        const x = (e.clientX - r.left) * (CAP_W / r.width);
                                                        const y = (e.clientY - r.top) * (CAP_H / r.height);
                                                        
                                                        // If user taps an existing stamp, remove it so they can restamp cleanly
                                                        const hitStampIdx = cap.stamps.findIndex(st => Math.hypot(st.x - x, st.y - y) <= 16);
                                                        if (hitStampIdx !== -1) {
                                                            cap.stamps.splice(hitStampIdx, 1);
                                                            haptic(6);
                                                            capRedraw();
                                                            capMsg("Stamp removed (" + cap.stamps.length + "/" + cap.targets.length + " placed).", false);
                                                            return;
                                                        }
                                                        
                                                        if (cap.stamps.length >= cap.targets.length) {
                                                            capMsg("All " + cap.targets.length + " stamps placed. Tap Submit or tap a stamp to redo.", false);
                                                            return;
                                                        }
                                                        
                                                        cap.stamps.push({ x, y });
                                                        haptic(10);
                                                        capRedraw();
                                                        
                                                        if (cap.stamps.length === cap.targets.length) {
                                                            capMsg("4/4 stamps placed — tap Submit to check accuracy.", false);
                                                        } else {
                                                            capMsg("Stamped " + cap.stamps.length + " of " + cap.targets.length + ".", false);
                                                        }
                                                    }
                                                    
                                                    document.getElementById("captcha-canvas").addEventListener("pointerdown", (e) => { e.preventDefault(); capTap(e); });
                                                    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && capIsOpen()) window.closeCaptcha(); });
                                                    
                                                    // ======================================================================
                                                    // 4. TILE PICKER
                                                    // ======================================================================
                                                    const TP_CELL = 30;
                                                    const tp = { minX: -4, minY: -4, cols: 8, rows: 8, sel: null, onOk: null };
                                                    const tpReserved = (gx, gy) => (gx === -1 || gx === 0) && (gy === -1 || gy === 0);
                                                    const tpEntryAt = (gx, gy) => wallEntries.find(e => e.gx === gx && e.gy === gy);
                                                    const tpOpen = () => document.getElementById("tilepick-modal").classList.contains("open");
                                                    
                                                    function tpBounds() {
                                                        let minX = -4, maxX = 3, minY = -4, maxY = 3;
                                                        const pts = wallEntries.map(e => [e.gx, e.gy]);
                                                        if (tp.sel) pts.push([tp.sel.gx, tp.sel.gy]);
                                                        pts.forEach(([x, y]) => {
                                                            minX = Math.min(minX, x - 2); maxX = Math.max(maxX, x + 2);
                                                            minY = Math.min(minY, y - 2); maxY = Math.max(maxY, y + 2);
                                                        });
                                                        tp.minX = Math.max(-60, minX); tp.minY = Math.max(-60, minY);
                                                        tp.cols = Math.min(60, maxX) - tp.minX + 1;
                                                        tp.rows = Math.min(60, maxY) - tp.minY + 1;
                                                    }
                                                    
                                                    function tpMsg() {
                                                        const m = document.getElementById("tilepick-msg");
                                                        const go = document.getElementById("tilepick-go");
                                                        if (tp.sel) { m.textContent = "Your tile: " + tp.sel.gx + ", " + tp.sel.gy; m.classList.add("ok"); }
                                                        else { m.textContent = "Tap a free square to claim it."; m.classList.remove("ok"); }
                                                        if (go) go.disabled = !tp.sel;
                                                    }
                                                    
                                                    function tpDraw() {
                                                        const cv = document.getElementById("tilepick-canvas");
                                                        const C = TP_CELL;
                                                        cv.width = tp.cols * C; cv.height = tp.rows * C;
                                                        const c = cv.getContext("2d");
                                                        c.fillStyle = "#fff"; c.fillRect(0, 0, cv.width, cv.height);
                                                        const accent = (getComputedStyle(document.documentElement).getPropertyValue("--accent") || "#1d4ed8").trim();
                                                        for (let r = 0; r < tp.rows; r++) {
                                                            for (let k = 0; k < tp.cols; k++) {
                                                                const gx = tp.minX + k, gy = tp.minY + r, x = k * C, y = r * C;
                                                                const entry = tpEntryAt(gx, gy);
                                                                if (tpReserved(gx, gy)) {
                                                                    c.fillStyle = "#dbeafe"; c.fillRect(x, y, C, C);
                                                                } else if (entry) {
                                                                    c.drawImage(getCachedTileCanvas(entry), x + 1, y + 1, C - 2, C - 2);
                                                                    c.fillStyle = "rgba(148,163,184,.5)"; c.fillRect(x, y, C, C);
                                                                } else {
                                                                    c.save();
                                                                    c.strokeStyle = "#cbd5e1"; c.lineWidth = 1; c.setLineDash([3, 3]);
                                                                    c.strokeRect(x + 3.5, y + 3.5, C - 7, C - 7);
                                                                    c.restore();
                                                                }
                                                                c.strokeStyle = "rgba(226,232,240,.9)"; c.lineWidth = 1;
                                                                c.strokeRect(x + 0.5, y + 0.5, C, C);
                                                            }
                                                        }
                                                        // origin crosshair label
                                                        const ox = (0 - tp.minX) * C, oy = (0 - tp.minY) * C;
                                                        c.fillStyle = "#1d4ed8"; c.font = "800 9px Inter, sans-serif"; c.textAlign = "center"; c.textBaseline = "middle";
                                                        c.fillText("ART", ox, oy);
                                                        if (tp.sel) {
                                                            const x = (tp.sel.gx - tp.minX) * C, y = (tp.sel.gy - tp.minY) * C;
                                                            c.fillStyle = accent + "33"; c.fillRect(x, y, C, C);
                                                            c.strokeStyle = accent; c.lineWidth = 3; c.strokeRect(x + 1.5, y + 1.5, C - 3, C - 3);
                                                            c.fillStyle = accent; c.font = "800 14px Inter, sans-serif";
                                                            c.fillText("✓", x + C / 2, y + C / 2 + 1);
                                                        }
                                                    }
                                                    
                                                    function tpScrollTo(gx, gy) {
                                                        const sc = document.getElementById("tilepick-scroll");
                                                        sc.scrollLeft = (gx - tp.minX + 0.5) * TP_CELL - sc.clientWidth / 2;
                                                        sc.scrollTop = (gy - tp.minY + 0.5) * TP_CELL - sc.clientHeight / 2;
                                                    }
                                                    
                                                    function tpRender(recenter) {
                                                        tpBounds(); tpDraw(); tpMsg();
                                                        if (recenter) requestAnimationFrame(() => tp.sel ? tpScrollTo(tp.sel.gx, tp.sel.gy) : tpScrollTo(0, 0));
                                                    }
                                                    
                                                    window.openTilePicker = function (onOk) {
                                                        if (tpOpen()) return;
                                                        tp.onOk = onOk;
                                                        if (tp.sel && (tpReserved(tp.sel.gx, tp.sel.gy) || tpEntryAt(tp.sel.gx, tp.sel.gy))) tp.sel = null;
                                                        document.getElementById("tilepick-modal").classList.add("open");
                                                        tpRender(true);
                                                        Promise.resolve(loadWallEntries({ autoPlay: false, manual: false, isLiveSync: true })).then(() => {
                                                            if (!tpOpen()) return;
                                                            if (tp.sel && tpEntryAt(tp.sel.gx, tp.sel.gy)) { tp.sel = null; showToast("Your pick was just taken. Choose another."); }
                                                            tpRender(false);
                                                        }).catch(() => {});
                                                    };
                                                    window.closeTilePicker = function () {
                                                        document.getElementById("tilepick-modal").classList.remove("open");
                                                        tp.onOk = null;
                                                    };
                                                    window.tpRandom = function () {
                                                        const s = pickRandomOpenSlot(wallEntries);
                                                        tp.sel = { gx: s.gx, gy: s.gy };
                                                        haptic(6);
                                                        tpRender(false);
                                                        tpScrollTo(s.gx, s.gy);
                                                    };
                                                    window.tpContinue = function () {
                                                        if (!tp.sel) { showToast("Tap a free square first."); return; }
                                                        if (tpEntryAt(tp.sel.gx, tp.sel.gy)) { tp.sel = null; tpRender(false); showToast("That tile was just taken."); return; }
                                                        window.__chosenSlot = { gx: tp.sel.gx, gy: tp.sel.gy };
                                                        const fn = tp.onOk;
                                                        window.closeTilePicker();
                                                        if (typeof fn === "function") fn();
                                                    };
                                                    
                                                    document.getElementById("tilepick-canvas").addEventListener("click", (e) => {
                                                        const cv = e.currentTarget, r = cv.getBoundingClientRect();
                                                        const gx = tp.minX + Math.floor(((e.clientX - r.left) * (cv.width / r.width)) / TP_CELL);
                                                        const gy = tp.minY + Math.floor(((e.clientY - r.top) * (cv.height / r.height)) / TP_CELL);
                                                        if (tpReserved(gx, gy)) { showToast("The center is reserved for the logo."); return; }
                                                        if (tpEntryAt(gx, gy)) { showToast("That tile is already taken."); return; }
                                                        tp.sel = { gx, gy };
                                                        haptic(8);
                                                        tpRender(false);
                                                    });
                                                    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && tpOpen()) window.closeTilePicker(); });
                                                })();
                                                
                                                (function () {
                                                    "use strict";
                                                    var $ = function (id) { return document.getElementById(id); };
                                                    var q = function (s) { return document.querySelector(s); };
                                                    
                                                    function wrap(name, make) {
                                                        var orig = window[name];
                                                        if (typeof orig !== "function") return;
                                                        window[name] = make(orig);
                                                    }
                                                    
                                                    // ---------- per-button busy (blocks double taps) ----------
                                                    function fwBusy(el, fn, fallback) {
                                                        if (!el) return Promise.resolve().then(fn);
                                                        if (el.classList.contains("is-busy")) return Promise.resolve(fallback);
                                                        el.classList.add("is-busy");
                                                        el.setAttribute("aria-busy", "true");
                                                        return Promise.resolve().then(fn).finally(function () {
                                                            el.classList.remove("is-busy");
                                                            el.removeAttribute("aria-busy");
                                                        });
                                                    }
                                                    
                                                    // ---------- floating work chip ----------
                                                    var chip = document.createElement("div");
                                                    chip.className = "work-chip";
                                                    chip.setAttribute("role", "status");
                                                    chip.hidden = true;
                                                    chip.innerHTML = '<span class="work-spin"></span><span class="work-label"></span>';
                                                    document.body.appendChild(chip);
                                                    var works = [];
                                                    function renderWork() {
                                                        chip.hidden = works.length === 0;
                                                        if (works.length) chip.querySelector(".work-label").textContent = works[works.length - 1].label;
                                                    }
                                                    function fwWork(label, fn) {
                                                        var w = { label: label };
                                                        works.push(w); renderWork();
                                                        var done = function () { var i = works.indexOf(w); if (i > -1) works.splice(i, 1); renderWork(); };
                                                        var p;
                                                        try { p = Promise.resolve(fn()); } catch (e) { done(); throw e; }
                                                        return p.finally(done);
                                                    }
                                                    
                                                    // ---------- global progress bar for Apps Script / QR calls ----------
                                                    var bar = document.createElement("div");
                                                    bar.id = "net-bar";
                                                    bar.setAttribute("aria-hidden", "true");
                                                    document.body.appendChild(bar);
                                                    var inflight = 0, showT = 0;
                                                    function syncBar() {
                                                        if (inflight > 0) {
                                                            if (!showT && !bar.classList.contains("on")) {
                                                                showT = setTimeout(function () { showT = 0; if (inflight > 0) bar.classList.add("on"); }, 350);
                                                            }
                                                        } else {
                                                            clearTimeout(showT); showT = 0;
                                                            bar.classList.remove("on");
                                                        }
                                                    }
                                                    var gas = (typeof GAS_WEB_APP_URL === "string") ? GAS_WEB_APP_URL : "";
                                                    function tracked(input) {
                                                        var u = String(typeof input === "string" ? input : ((input && input.url) || input));
                                                        return (gas && u.indexOf(gas) === 0) || u.indexOf("qrdx.dev") > -1 || u.indexOf("qrserver.com") > -1;
                                                    }
                                                    var nativeFetch = window.fetch.bind(window);
                                                    window.fetch = function (input, init) {
                                                        if (!tracked(input)) return nativeFetch(input, init);
                                                        inflight++; syncBar();
                                                        return nativeFetch(input, init).finally(function () {
                                                            inflight = Math.max(0, inflight - 1); syncBar();
                                                        });
                                                    };
                                                    
                                                    // ---------- Events: join / create / end ----------
                                                    wrap("submitJoinCode", function (orig) {
                                                        return function () {
                                                            var self = this, args = arguments;
                                                            return fwBusy(q('button[onclick="submitJoinCode()"]'), function () { return orig.apply(self, args); });
                                                        };
                                                    });
                                                    wrap("gasPost", function (orig) {
                                                        return function (payload) {
                                                            var self = this, args = arguments;
                                                            var sel = { createFWEvent: 'button[onclick="hostEvent()"]', endFWEvent: "#event-end-btn" }[payload && payload.action];
                                                            var btn = sel ? q(sel) : null;
                                                            return fwBusy(btn, function () { return orig.apply(self, args); }, { ok: false, error: "Please wait…" });
                                                        };
                                                    });
                                                    
                                                    // ---------- Reactions (spinner only, taps stay allowed) ----------
                                                    wrap("toggleReaction", function (orig) {
                                                        return function (type) {
                                                            var entry = (typeof modalEntry !== "undefined") ? modalEntry : null;
                                                            var key = entry ? entry.id + ":" + type : "";
                                                            var btn = q('#react-bar .react-btn[data-r="' + type + '"]');
                                                            var p = orig.apply(this, arguments);
                                                            try {
                                                                if (btn && key && reactPending.has(key)) {
                                                                    btn.classList.add("is-loading");
                                                                    (async function () {
                                                                        while (reactPending.has(key)) await new Promise(function (r) { setTimeout(r, 120); });
                                                                        btn.classList.remove("is-loading");
                                                                    })();
                                                                }
                                                            } catch (e) {}
                                                            return p;
                                                        };
                                                    });
                                                    
                                                    // ---------- Sync wall button + tile picker Continue ----------
                                                    wrap("loadWallEntries", function (orig) {
                                                        return async function (opts) {
                                                            var quiet = !!(opts && opts.isLiveSync);
                                                            var refresh = $("refresh-btn"), go = $("tilepick-go");
                                                            var pickOpen = !!q("#tilepick-modal.open");
                                                            if (!quiet && refresh) refresh.classList.add("is-loading");
                                                            if (pickOpen && go) go.classList.add("is-loading");
                                                            try { return await orig.apply(this, arguments); }
                                                            finally {
                                                                if (refresh) refresh.classList.remove("is-loading");
                                                                if (go) go.classList.remove("is-loading");
                                                            }
                                                        };
                                                    });
                                                    
                                                    // ---------- Upload buttons + "Uploading" chip ----------
                                                    var upW = null;
                                                    wrap("setUploadUI", function (orig) {
                                                        return function () {
                                                            var r = orig.apply(this, arguments);
                                                            var on = false;
                                                            try { on = !!uploading; } catch (e) {}
                                                            ["nav-upload-btn", "dock-upload-btn", "more-upload-btn", "focus-upload-btn"].forEach(function (id) {
                                                                var b = $(id); if (b) b.classList.toggle("is-loading", on);
                                                            });
                                                            if (!on && upW) { var i = works.indexOf(upW); if (i > -1) works.splice(i, 1); upW = null; renderWork(); }
                                                            return r;
                                                        };
                                                    });
                                                    
                                                    // ---------- Radio connecting ----------
                                                    wrap("updateMuteIcon", function (orig) {
                                                        return function (s) {
                                                            var r = orig.apply(this, arguments);
                                                            var conn = typeof s === "string" && /^(Connecting|Fetching)/i.test(s);
                                                            var a = $("mute-btn"), b = $("radio-chip-btn");
                                                            if (a) a.classList.toggle("is-loading", conn);
                                                            if (b) b.classList.toggle("is-loading", conn);
                                                            return r;
                                                        };
                                                    });
                                                    
                                                    // ---------- Export / share / video ----------
                                                    wrap("loadQRForExport", function (orig) {
                                                        return function () { var self = this, a = arguments; return fwWork("Preparing image…", function () { return orig.apply(self, a); }); };
                                                    });
                                                    wrap("exportReplayVideo", function (orig) {
                                                        return function () { var self = this, a = arguments; return fwWork("Recording replay…", function () { return orig.apply(self, a); }); };
                                                    });
                                                })();
                                                
                                                (function () {
                                                    "use strict";
                                                    var $ = function (id) { return document.getElementById(id); };
                                                    var LS_CONFIRM = "fw_reveal_confirm_v1";
                                                    var reduceMotion = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
                                                    var CURTAIN_MS = reduceMotion ? 700 : 2800;
                                                    
                                                    window.curtainHold = false;            // while true the wall canvas stays blank
                                                    var curtainClosedShown = false;        // a closed curtain is (or was) on screen
                                                    var revealing = false;
                                                    var lastHiddenForMe = null;
                                                    var curtainRun = 0;

                                                    function syncFocusMode() {
                                                        var active = focusLinkRequested && hiddenForMe() && !hasFocusPostForEvent();
                                                        var changed = document.body.classList.contains("focus-mode") !== active;
                                                        focusModeActive = active;
                                                        document.body.classList.toggle("focus-mode", active);
                                                        syncFocusPostUI();
                                                        if (active && currentView !== "draw") window.switchView("draw");
                                                        if (!active && typeof window.flushPendingWhatsNew === "function") window.flushPendingWhatsNew();
                                                        if (changed) requestAnimationFrame(function () { window.dispatchEvent(new Event("resize")); });
                                                    }
                                                    
                                                    function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
                                                    function wrap(name, make) {
                                                        var orig = window[name];
                                                        if (typeof orig !== "function") return;
                                                        window[name] = make(orig);
                                                    }
                                                    
                                                    // true for everybody except the host while the host has the arts hidden
                                                    function hiddenForMe() {
                                                        return !!curEvent && !!curEvent.hidden && curEvent.status === "active" && !isHost();
                                                    }
                                                    window.evHiddenForMe = hiddenForMe;
                                                    
                                                    function setHold(on) {
                                                        window.curtainHold = !!on;
                                                        var v = $("view-wall");
                                                        if (v) v.classList.toggle("curtain-hold", !!on);
                                                        if (!on && typeof scheduleWallPaint === "function") scheduleWallPaint();
                                                    }
                                                    
                                                    function paintClosedText() {
                                                        var n = $("curtain-event-name");
                                                        if (n) n.textContent = curEvent ? curEvent.name : "";
                                                    }
                                                    
                                                    // curtain is shown closed. animate=true plays the "curtain closes" animation.
                                                    function showClosed(animate) {
                                                        var st = $("curtain-stage"), v = $("view-wall");
                                                        curtainRun++;
                                                        revealing = false;
                                                        setHold(true);
                                                        v.classList.add("curtain-closed");
                                                        paintClosedText();
                                                        curtainClosedShown = true;
                                                        st.style.setProperty("--curtain-ms", CURTAIN_MS + "ms");
                                                        st.hidden = false;
                                                        if (animate) {
                                                            st.classList.add("no-anim", "open");
                                                            void st.offsetWidth;
                                                            st.classList.remove("no-anim");
                                                            void st.offsetWidth;
                                                            st.classList.remove("open");
                                                        } else {
                                                            st.classList.remove("open");
                                                        }
                                                    }
                                                    
                                                    // curtain rolls open, then the drawings start drawing
                                                    async function playReveal() {
                                                        if (revealing) return;
                                                        revealing = true;
                                                        var run = ++curtainRun;
                                                        var st = $("curtain-stage"), v = $("view-wall");
                                                        try {
                                                            setHold(true);
                                                            for (var i = 0; i < 40 && loadingWall; i++) await sleep(150);
                                                            if (run !== curtainRun) return;
                                                            try { await loadWallEntries({ autoPlay: false, manual: false }); } catch (e) {}
                                                            if (run !== curtainRun) return;
                                                            
                                                            haptic(20);
                                                            st.style.setProperty("--curtain-ms", CURTAIN_MS + "ms");
                                                            st.classList.add("open");
                                                            await sleep(CURTAIN_MS + 150);
                                                            if (run !== curtainRun) return;
                                                            
                                                            st.hidden = true;
                                                            st.classList.remove("open");
                                                            v.classList.remove("curtain-closed");
                                                            curtainClosedShown = false;
                                                            setHold(false);
                                                            if (currentView === "wall") { userMoved = false; renderWall(true); }   // drawings start now
                                                            launchConfetti();
                                                            showToast("🎭 The art is revealed!");
                                                        } finally {
                                                            if (run === curtainRun) revealing = false;
                                                        }
                                                    }
                                                    
                                                    function refreshCurtain() {
                                                        var st = $("curtain-stage"), v = $("view-wall");
                                                        if (!st || !v) return;
                                                        var must = hiddenForMe();
                                                        var was = lastHiddenForMe;
                                                        lastHiddenForMe = must;
                                                        
                                                        if (must) {
                                                            if (!curtainClosedShown || st.hidden || revealing) showClosed(was === false && currentView === "wall");
                                                            else paintClosedText();
                                                            return;
                                                        }
                                                        if (curtainClosedShown) {                       // it was hidden, now it is not
                                                            if (currentView === "wall") playReveal();   // otherwise wait until the Wall tab is opened
                                                            return;
                                                        }
                                                        st.hidden = true;
                                                        v.classList.remove("curtain-closed");
                                                        if (window.curtainHold) setHold(false);
                                                    }
                                                    
                                                    wrap("switchView", function (orig) {
                                                        return function (name) {
                                                            return orig.call(this, focusModeActive ? "draw" : name);
                                                        };
                                                    });

                                                    // ---------------- host actions ----------------
                                                    var hideBusy = false;
                                                    async function setEventHidden(hide) {
                                                        if (!curEvent || !isHost() || hideBusy) return;
                                                        hideBusy = true;
                                                        var code = curEvent.code;
                                                        try {
                                                            var j = await gasPost({ action: "setFWEventHidden", code: code, hostToken: hostToken(code), hidden: !!hide });
                                                            if (!j || !j.ok) { showToast((j && j.error) || "Couldn't update the event."); return; }
                                                            if (curEvent && curEvent.code === code) {
                                                                curEvent = Object.assign({}, curEvent, j.event);
                                                                lsSet(LS_EVENT, curEvent);
                                                            }
                                                            try {
                                                                if (wallChannel && wallChannel.state === "joined") {
                                                                    wallChannel.send({ type: "broadcast", event: "event-visibility", payload: { code: code, hidden: !!hide } });
                                                                }
                                                            } catch (e) {}
                                                            applyEventUI();
                                                            showToast(hide ? "Arts hidden · guests see the closed curtain 🎭" : "Arts revealed 🎉");
                                                            haptic(12);
                                                        } catch (e) {
                                                            showToast("Couldn't reach the server.");
                                                        } finally {
                                                            hideBusy = false;
                                                            renderEventModal();
                                                        }
                                                    }
                                                    
                                                    // the switch means "arts are hidden". Turning it off = reveal.
                                                    window.onHideSwitch = function (sw) {
                                                        if (!curEvent || !isHost()) { sw.checked = !!(curEvent && curEvent.hidden); return; }
                                                        if (sw.checked) { setEventHidden(true); return; }
                                                        sw.checked = true;                               // stays on until the reveal really happened
                                                        var go = function () { setEventHidden(false); };
                                                        if (lsGet(LS_CONFIRM, true) !== false) {
                                                            askConsent("Reveal the art?",
                                                                "The curtain opens on every guest's screen and all drawings start replaying. You can hide them again later.",
                                                                go, { okLabel: "Open curtain" });
                                                            } else {
                                                                go();
                                                            }
                                                        };
                                                        window.onConfirmRevealToggle = function (cb) {
                                                            lsSet(LS_CONFIRM, !!cb.checked);
                                                            showToast(cb.checked ? "Will ask before revealing" : "Reveal won't ask first");
                                                        };
                                                        
                                                        // ---------------- guests: realtime + polling ----------------
                                                        async function syncEventMeta() {
                                                            if (!curEvent) return;
                                                            var code = curEvent.code;
                                                            try {
                                                                var res = await fetch(GAS_WEB_APP_URL + "?module=fwevent&code=" + encodeURIComponent(code) + "&_t=" + Date.now());
                                                                var j = await res.json();
                                                                if (j && j.ok && j.event && curEvent && curEvent.code === code) noteEventMeta(j.event);
                                                            } catch (e) {}
                                                        }
                                                        // the broadcast is only a nudge; the server decides (so a fake broadcast can't open the curtain)
                                                        window.onEventVisibility = function (p) {
                                                            if (!p || !curEvent || p.code !== curEvent.code) return;
                                                            syncEventMeta();
                                                        };
                                                        setInterval(function () {
                                                            if (curEvent && curEvent.hidden && curEvent.status === "active" && !isHost() && !document.hidden && navigator.onLine) syncEventMeta();
                                                        }, 10000);
                                                        
                                                        // ---------------- hook into the existing functions ----------------
                                                        wrap("setScope", function (orig) {
                                                            return function () {
                                                                curtainRun++;
                                                                revealing = false;
                                                                curtainClosedShown = false;
                                                                lastHiddenForMe = null;
                                                                var st = $("curtain-stage"), v = $("view-wall");
                                                                if (st) { st.hidden = true; st.classList.remove("open"); }
                                                                if (v) v.classList.remove("curtain-closed");
                                                                setHold(false);
                                                                return orig.apply(this, arguments);
                                                            };
                                                        });
                                                        
                                                        wrap("applyEventUI", function (orig) {
                                                            return function () {
                                                                var r = orig.apply(this, arguments);
                                                                try {
                                                                    if (curEvent && curEvent.hidden && curEvent.status === "active") {
                                                                        var pill = $("event-pill");
                                                                        if (pill && !pill.hidden && isHost()) pill.textContent += " · 🎭 hidden";
                                                                        var note = $("event-post-note");
                                                                        if (note) note.textContent += isHost() ? " · hidden from guests" : " · art stays hidden until the host reveals it";
                                                                    }
                                                                    refreshCurtain();
                                                                    syncFocusMode();
                                                                } catch (e) {}
                                                                return r;
                                                            };
                                                        });
                                                        
                                                        wrap("renderEventModal", function (orig) {
                                                            return function () {
                                                                var r = orig.apply(this, arguments);
                                                                var box = $("event-host-controls");
                                                                if (!box) return r;
                                                                var show = !!curEvent && curEvent.status === "active" && isHost();
                                                                box.hidden = !show;
                                                                if (show) {
                                                                    $("event-hide-switch").checked = !!curEvent.hidden;
                                                                    $("event-focus-switch").checked = isEventFocusEnabled(curEvent.code);
                                                                    $("event-confirm-reveal").checked = lsGet(LS_CONFIRM, true) !== false;
                                                                }
                                                                return r;
                                                            };
                                                        });
                                                        syncFocusMode();
                                                        
                                                        wrap("switchView", function (orig) {
                                                            return function (name) {
                                                                var r = orig.apply(this, arguments);
                                                                if (name === "wall") refreshCurtain();
                                                                return r;
                                                            };
                                                        });
                                                        
                                                        refreshCurtain();
                                                    })();
                                                    
                                                    (function () {
                                                        "use strict";
                                                        var $ = function (id) { return document.getElementById(id); };
                                                        var LS_RAIL = "fw_rail_collapsed_v1";
                                                        var LS_PANEL = "fw_panel_collapsed_v1";
                                                        
                                                        function relayout() {
                                                            setTimeout(function () {
                                                                window.dispatchEvent(new Event("resize"));
                                                                try { syncUnit(); } catch (e) {}
                                                                try { if (typeof scheduleWallPaint === "function") scheduleWallPaint(); } catch (e) {}
                                                            }, 40);
                                                        }
                                                        
                                                        // ---------------- left rail ----------------
                                                        function applyRail(collapsed) {
                                                            document.body.classList.toggle("rail-collapsed", !!collapsed);
                                                            var t = $("rail-tab");
                                                            if (t) {
                                                                t.setAttribute("aria-expanded", String(!collapsed));
                                                                var label = collapsed ? "Show sidebar" : "Collapse sidebar";
                                                                t.setAttribute("aria-label", label);
                                                                t.title = label;
                                                            }
                                                        }
                                                        window.toggleRail = function () {
                                                            var c = !document.body.classList.contains("rail-collapsed");
                                                            lsSet(LS_RAIL, c);
                                                            applyRail(c);
                                                            haptic(8);
                                                            relayout();
                                                        };
                                                        
                                                        // ---------------- right panel (Draw) ----------------
                                                        function applyPanel(collapsed) {
                                                            var v = $("view-draw");
                                                            if (v) v.classList.toggle("panel-off", !!collapsed);
                                                            var b = $("panel-toggle");
                                                            if (b) {
                                                                b.classList.toggle("active", !!collapsed);
                                                                b.setAttribute("aria-pressed", String(!!collapsed));
                                                                var label = collapsed ? "Show side panel" : "Collapse side panel";
                                                                b.setAttribute("aria-label", label);
                                                                b.title = label;
                                                            }
                                                        }
                                                        window.togglePanel = function () {
                                                            var v = $("view-draw");
                                                            var c = !(v && v.classList.contains("panel-off"));
                                                            lsSet(LS_PANEL, c);
                                                            applyPanel(c);
                                                            haptic(8);
                                                            relayout();
                                                        };
                                                        
                                                        // ---------------- fullscreen ----------------
                                                        var d = document, root = d.documentElement;
                                                        var fsSupported = !!(d.fullscreenEnabled || d.webkitFullscreenEnabled);
                                                        function fsActive() { return !!(d.fullscreenElement || d.webkitFullscreenElement); }
                                                        function syncFsButton() {
                                                            var b = $("fs-btn");
                                                            if (!b) return;
                                                            b.hidden = !fsSupported;
                                                            b.classList.toggle("active", fsActive());
                                                        }
                                                        window.toggleFullscreen = function () {
                                                            try {
                                                                var p;
                                                                if (fsActive()) p = (d.exitFullscreen || d.webkitExitFullscreen).call(d);
                                                                else p = (root.requestFullscreen || root.webkitRequestFullscreen).call(root);
                                                                if (p && p.catch) p.catch(function () { showToast("Fullscreen isn't available here."); });
                                                            } catch (e) {
                                                                showToast("Fullscreen isn't available here.");
                                                            }
                                                        };
                                                        ["fullscreenchange", "webkitfullscreenchange"].forEach(function (ev) {
                                                            d.addEventListener(ev, function () { syncFsButton(); relayout(); });
                                                        });
                                                        
                                                        // ---------------- current view on <body> (lets CSS hide the top bar in Draw) ----------------
                                                        var _switchView = window.switchView;
                                                        if (typeof _switchView === "function") {
                                                            window.switchView = function (name) {
                                                                var r = _switchView.apply(this, arguments);
                                                                document.body.dataset.view = name;
                                                                return r;
                                                            };
                                                        }
                                                        document.body.dataset.view = (typeof currentView === "string" && currentView) || "home";
                                                        
                                                        // ---------------- restore saved state ----------------
                                                        applyRail(lsGet(LS_RAIL, false) === true);
                                                        applyPanel(lsGet(LS_PANEL, false) === true);
                                                        syncFsButton();
                                                        relayout();
                                                    })();
                                                    
                                                    (function () {
                                                        "use strict";
                                                        var ORIG = window.renderStrokesInstant;
                                                        if (typeof ORIG !== "function" || window.__layeredReplay) return;
                                                        window.__layeredReplay = true;
                                                        
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
                                                            var groupClip = false;
                                                            var groupOpacity = 1;
                                                            function flush() {
                                                                if (!group.length) return;
                                                                sc.ctx.clearRect(0, 0, dim, dim);
                                                                ORIG(sc.ctx, group, dim, false);
                                                                if (groupClip) {
                                                                    sc.ctx.globalCompositeOperation = "destination-in";
                                                                    sc.ctx.drawImage(ctx.canvas, 0, 0);
                                                                    sc.ctx.globalCompositeOperation = "source-over";
                                                                }
                                                                ctx.save();
                                                                ctx.globalAlpha = groupOpacity;
                                                                ctx.globalCompositeOperation = "source-over";
                                                                ctx.drawImage(sc.cv, 0, 0);
                                                                ctx.restore();
                                                                group = [];
                                                            }
                                                            for (var i = 0; i < list.length; i++) {
                                                                var st = list[i];
                                                                if (!st || st.k === "bg") continue;
                                                                if (st.k === "ly") {
                                                                    flush();
                                                                    groupClip = !!st.clip;
                                                                    groupOpacity = Math.max(0, Math.min(1, Number(st.opacity == null ? 1 : st.opacity)));
                                                                    continue;
                                                                }
                                                                group.push(st);
                                                            }
                                                            flush();
                                                        };
                                                        
                                                        // ======================================================================
                                                        // 3. REPLAY ENGINE
                                                        // ======================================================================
                                                        function makeReplay(strokeList, dim) {
                                                            var groups = [], items = [], cur = null, total = 0, nextClip = false, nextOpacity = 1;
                                                            (strokeList || []).forEach(function (st) {
                                                                if (!st || st.k === "bg") return;
                                                                if (st.k === "ly") { cur = null; nextClip = !!st.clip; nextOpacity = Math.max(0, Math.min(1, Number(st.opacity == null ? 1 : st.opacity))); return; }
                                                                var units;
                                                                if (st.k === "text") units = Math.max(1, String(st.t || "").length);
                                                                else if (st.k === "fill") units = 1;
                                                                else if (st.p && st.p.length) units = st.p.length > 1 ? st.p.length - 1 : 1;
                                                                else return;
                                                                if (!cur) {
                                                                    cur = { cv: null, ctx: null, fill: false, clip: nextClip, opacity: nextOpacity };
                                                                    groups.push(cur);
                                                                    nextClip = false;
                                                                    nextOpacity = 1;
                                                                }
                                                                if (st.k === "fill") cur.fill = true;
                                                                items.push({ g: cur, st: st, units: units });
                                                                total += units;
                                                            });
                                                            
                                                            var out = document.createElement("canvas");
                                                            out.width = out.height = dim;
                                                            var octx = out.getContext("2d");
                                                            var clipBuffer = poolCanvas("clip", dim, true);
                                                            var idx = 0, done = 0, committed = 0;

                                                            function compositeGroup(g, source) {
                                                                octx.save();
                                                                octx.globalAlpha = g.opacity;
                                                                if (!g.clip) {
                                                                    octx.drawImage(source, 0, 0);
                                                                    octx.restore();
                                                                    return;
                                                                }
                                                                clipBuffer.ctx.clearRect(0, 0, dim, dim);
                                                                clipBuffer.ctx.drawImage(source, 0, 0);
                                                                clipBuffer.ctx.globalCompositeOperation = "destination-in";
                                                                clipBuffer.ctx.drawImage(out, 0, 0);
                                                                clipBuffer.ctx.globalCompositeOperation = "source-over";
                                                                octx.drawImage(clipBuffer.cv, 0, 0);
                                                                octx.restore();
                                                            }
                                                            
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
                                                                            compositeGroup(g, sc.cv);
                                                                        } else if (g.cv) {
                                                                            compositeGroup(g, g.cv);
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
                                                    
                                                    (function () {
                                                        "use strict";
                                                        var $ = function (id) { return document.getElementById(id); };
                                                        var LS_LIB = "fw_event_library_v1";
                                                        var LS_OPENAPP = "fw_open_in_app_v1";
                                                        var SS_TRY = "fw_app_try_v1";
                                                        var SS_BAR = "fw_app_bar_closed_v1";
                                                        var APP_PKG = "com.artcher.app";
                                                        
                                                        function wrap(name, make) {
                                                            var o = window[name];
                                                            if (typeof o === "function") window[name] = make(o);
                                                        }
                                                        function mk(tag, cls, text) {
                                                            var e = document.createElement(tag);
                                                            if (cls) e.className = cls;
                                                            if (text != null) e.textContent = text;
                                                            return e;
                                                        }
                                                        function evEnded() { return !!curEvent && !evIsLive(); }
                                                        function inviteUrl(code) { return buildEventInviteUrl(code); }
                                                        
                                                        // ======================================================================
                                                        // 1. DRAW TAB LOCK WHEN THE EVENT HAS ENDED
                                                        // ======================================================================
                                                        function applyDrawLock() {
                                                            var ended = evEnded();
                                                            var nav = document.querySelector('.nav-item[data-view="draw"]');
                                                            if (nav) {
                                                                nav.classList.toggle("is-disabled", ended);
                                                                nav.setAttribute("aria-disabled", String(ended));
                                                                nav.title = ended ? "Event ended - drawing is closed" : "";
                                                            }
                                                            var start = document.querySelector(".landing-buttons .btn-primary");
                                                            if (start) start.classList.toggle("is-disabled", ended);
                                                            if (ended && currentView === "draw") window.switchView("wall");
                                                        }
                                                        
                                                        wrap("switchView", function (o) {
                                                            return function (name) {
                                                                if (name === "draw" && evEnded()) {
                                                                    showToast("This event has ended, so drawing is closed. Leave the event to draw on the main wall.");
                                                                    haptic(20);
                                                                    return;
                                                                }
                                                                return o.apply(this, arguments);
                                                            };
                                                        });
                                                        
                                                        // ======================================================================
                                                        // 2. INSIDE AN EVENT: NO TILE PICKING, ALWAYS RANDOM
                                                        // ======================================================================
                                                        wrap("openTilePicker", function (o) {
                                                            return function (onOk) {
                                                                if (curEvent) {
                                                                    window.__chosenSlot = null;
                                                                    if (typeof onOk === "function") onOk();
                                                                    return;
                                                                }
                                                                return o.apply(this, arguments);
                                                            };
                                                        });
                                                        
                                                        wrap("applyEventUI", function (o) {
                                                            return function () {
                                                                var r = o.apply(this, arguments);
                                                                try {
                                                                    applyDrawLock();
                                                                } catch (e) {}
                                                                return r;
                                                            };
                                                        });
                                                        
                                                        // ======================================================================
                                                        // 3. EVENT LIBRARY
                                                        // ======================================================================
                                                        function libGet() { var a = lsGet(LS_LIB, []); return Array.isArray(a) ? a : []; }
                                                        function libSet(a) { lsSet(LS_LIB, a.slice(0, 60)); }
                                                        function entryEnded(e) { return e.status !== "active" || Date.now() >= (e.endTs || 0); }
                                                        function fmtDate(ts) {
                                                            try { return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }); }
                                                            catch (x) { return ""; }
                                                        }
                                                        
                                                        function libUpsert(ev, keepOrder) {
                                                            if (!ev || !ev.code) return;
                                                            var a = libGet();
                                                            var i = a.findIndex(function (x) { return x.code === ev.code; });
                                                            var old = i >= 0 ? a[i] : null;
                                                            var rec = {
                                                                code: ev.code,
                                                                name: ev.name || (old && old.name) || ev.code,
                                                                startTs: ev.startTs || (old && old.startTs) || 0,
                                                                endTs: ev.endTs || (old && old.endTs) || 0,
                                                                status: ev.status || (old && old.status) || "active",
                                                                joinedAt: old ? old.joinedAt : Date.now(),
                                                                hosted: !!((old && old.hosted) || hostToken(ev.code))
                                                            };
                                                            if (old) a.splice(i, 1);
                                                            if (old && keepOrder) a.splice(i, 0, rec); else a.unshift(rec);
                                                            libSet(a);
                                                            renderLib();
                                                        }
                                                        
                                                        wrap("setScope", function (o) {
                                                            return function (ev) {
                                                                var r = o.apply(this, arguments);
                                                                if (ev) libUpsert(ev);
                                                                return r;
                                                            };
                                                        });
                                                        wrap("noteEventMeta", function (o) {
                                                            return function (meta) {
                                                                if (meta && meta.code) libUpsert(meta, true);   // before it may auto-leave an archived event
                                                                return o.apply(this, arguments);
                                                            };
                                                        });
                                                        
                                                        function libRow(e) {
                                                            var row = mk("div", "evlib-row" + (curEvent && curEvent.code === e.code ? " current" : ""));
                                                            var info = mk("div", "evlib-info");
                                                            info.appendChild(mk("div", "evlib-name", e.name));
                                                            var ended = entryEnded(e);
                                                            var meta = e.code + (e.startTs ? " · " + fmtDate(e.startTs) : "") + (e.hosted ? " · hosted" : "");
                                                            info.appendChild(mk("div", "evlib-meta", meta));
                                                            info.appendChild(mk("span", "evlib-pill" + (ended ? " done" : ""), ended ? "Archived" : fmtLeft(e.endTs - Date.now())));
                                                            
                                                            var acts = mk("div", "evlib-actions");
                                                            var open = mk("button", "btn btn-sm btn-primary", "Open"); open.type = "button";
                                                            open.onclick = function () { openLibEvent(e); };
                                                            var qr = mk("button", "btn btn-sm", "QR"); qr.type = "button";
                                                            qr.onclick = function () { openEventQR(e); };
                                                            var del = mk("button", "btn btn-sm", "✕"); del.type = "button";
                                                            del.title = "Remove from library"; del.setAttribute("aria-label", "Remove from library");
                                                            del.onclick = function () {
                                                                askConsent("Remove from library?", "\"" + e.name + "\" is removed from this list. The event itself is not deleted.", function () {
                                                                    libSet(libGet().filter(function (x) { return x.code !== e.code; }));
                                                                    renderLib();
                                                                }, { danger: true, okLabel: "Remove" });
                                                            };
                                                            acts.append(open, qr, del);
                                                            row.append(info, acts);
                                                            return row;
                                                        }
                                                        
                                                        function renderLib() {
                                                            var a = libGet();
                                                            var sub = $("evlib-more-sub");
                                                            if (sub) sub.textContent = a.length ? a.length + " saved · live & archived" : "Events you join are saved here";
                                                            var list = $("evlib-list");
                                                            if (!list) return;
                                                            list.replaceChildren();
                                                            if (!a.length) {
                                                                list.appendChild(mk("div", "lb-empty", "No events yet. Join or host one and it will appear here."));
                                                                return;
                                                            }
                                                            var live = a.filter(function (e) { return !entryEnded(e); });
                                                            var done = a.filter(entryEnded);
                                                            [["Live now", live], ["Archive", done]].forEach(function (g) {
                                                                if (!g[1].length) return;
                                                                list.appendChild(mk("div", "saved-label evlib-h", g[0]));
                                                                g[1].forEach(function (e) { list.appendChild(libRow(e)); });
                                                            });
                                                        }
                                                        
                                                        function openLibEvent(e) {
                                                            closeLib();
                                                            if (curEvent && curEvent.code === e.code) { switchView("wall"); return; }
                                                            joinEventByCode(e.code).then(function (ok) { if (ok) switchView("wall"); });
                                                        }
                                                        
                                                        async function refreshLibStatuses() {
                                                            if (!navigator.onLine) return;
                                                            var a = libGet().slice(0, 20);
                                                            await Promise.all(a.map(async function (e) {
                                                                try {
                                                                    var res = await fetch(GAS_WEB_APP_URL + "?module=fwevent&code=" + encodeURIComponent(e.code) + "&_t=" + Date.now());
                                                                    var j = await res.json();
                                                                    if (j && j.ok && j.event) libUpsert(Object.assign({}, e, j.event), true);
                                                                } catch (x) {}
                                                            }));
                                                            renderLib();
                                                        }
                                                        
                                                        function openLib() {
                                                            var m = $("evlib-modal");
                                                            if (!m) return;
                                                            if ($("event-modal")) closeEventModal();
                                                            renderLib();
                                                            m.classList.add("open");
                                                            refreshLibStatuses();
                                                        }
                                                        function closeLib() { var m = $("evlib-modal"); if (m) m.classList.remove("open"); }
                                                        window.openEventLibrary = openLib;
                                                        window.closeEventLibrary = closeLib;
                                                        
                                                        // ======================================================================
                                                        // 4. EVENT QR CODE GENERATOR
                                                        // ======================================================================
                                                        var qrCur = null;
                                                        
                                                        async function openEventQR(rec) {
                                                            rec = rec || curEvent;
                                                            if (!rec || !rec.code) return;
                                                            qrCur = rec;
                                                            $("evqr-modal").classList.add("open");
                                                            $("evqr-msg").textContent = "Making QR…";
                                                            var url = inviteUrl(rec.code);
                                                            var img = null;
                                                            try { img = await loadQRForExport(url, 520); } catch (e) {}
                                                            if (qrCur !== rec) return;
                                                            
                                                            var c = $("evqr-canvas"), W = 720, H = 900;
                                                            c.width = W; c.height = H;
                                                            var x = c.getContext("2d");
                                                            var accent = (getComputedStyle(document.documentElement).getPropertyValue("--accent") || "#1d4ed8").trim();
                                                            x.fillStyle = "#ffffff"; x.fillRect(0, 0, W, H);
                                                            x.fillStyle = accent; x.fillRect(0, 0, W, 16);
                                                            x.textAlign = "center"; x.textBaseline = "alphabetic";
                                                            
                                                            x.fillStyle = "#64748b"; x.font = "700 22px Inter, sans-serif";
                                                            x.fillText("THE ARTcher", W / 2, 70);
                                                            
                                                            var name = rec.name || rec.code, fs = 54;
                                                            x.fillStyle = "#0f172a";
                                                            do { x.font = "900 " + fs + "px Inter, sans-serif"; fs -= 2; } while (x.measureText(name).width > W - 100 && fs > 24);
                                                            if (x.measureText(name).width > W - 100) {
                                                                while (name.length > 3 && x.measureText(name + "…").width > W - 100) name = name.slice(0, -1);
                                                                name += "…";
                                                            }
                                                            x.fillText(name, W / 2, 150);
                                                            
                                                            var qs = 520, qx = (W - qs) / 2, qy = 190;
                                                            x.strokeStyle = "#e2e8f0"; x.lineWidth = 3;
                                                            x.beginPath(); x.roundRect(qx - 20, qy - 20, qs + 40, qs + 40, 24); x.stroke();
                                                            if (img) {
                                                                x.drawImage(img, qx, qy, qs, qs);
                                                            } else {
                                                                x.fillStyle = "#f1f5f9"; x.fillRect(qx, qy, qs, qs);
                                                                x.fillStyle = "#64748b"; x.font = "600 24px Inter, sans-serif";
                                                                x.fillText("QR unavailable offline", W / 2, qy + qs / 2);
                                                            }
                                                            
                                                            x.fillStyle = "#0f172a"; x.font = "900 34px Inter, sans-serif";
                                                            var focusInvite = isEventFocusEnabled(rec.code) && !!rec.hidden && !entryEnded(rec);
                                                            x.fillText(focusInvite ? "Scan to draw" : "Scan to join", W / 2, qy + qs + 80);
                                                            x.fillStyle = accent; x.font = '700 44px "JetBrains Mono", monospace';
                                                            x.fillText(rec.code.split("").join(" "), W / 2, qy + qs + 140);
                                                            x.fillStyle = "#64748b"; x.font = "600 20px Inter, sans-serif";
                                                            x.fillText(entryEnded(rec) ? "Archived · view only" : fmtLeft(rec.endTs - Date.now()), W / 2, qy + qs + 180);
                                                            
                                                            $("evqr-msg").textContent = img
                                                                ? (focusInvite ? "Scan to draw in focus mode · opens in the app if installed" : "Scan to join · opens in the app if installed")
                                                                : "Couldn't load the QR (offline?). Share the code instead.";
                                                        }
                                                        function closeEventQR() { $("evqr-modal").classList.remove("open"); qrCur = null; }
                                                        window.openEventQR = openEventQR;
                                                        
                                                        async function qrForTypedCode() {
                                                            var code = normCode($("evqr-code").value);
                                                            if (code.length < 4) { showToast("Enter the event code."); return; }
                                                            var rec = libGet().find(function (e) { return e.code === code; });
                                                            if (!rec) {
                                                                try {
                                                                    var res = await fetch(GAS_WEB_APP_URL + "?module=fwevent&code=" + code + "&_t=" + Date.now());
                                                                    var j = await res.json();
                                                                    if (!j.ok || !j.event) { showToast("No event with that code."); return; }
                                                                    rec = j.event;
                                                                } catch (e) { showToast("Couldn't reach the server."); return; }
                                                            }
                                                            openEventQR(rec);
                                                        }
                                                        
                                                        function copyQrLink() {
                                                            if (!qrCur) return;
                                                            var url = inviteUrl(qrCur.code);
                                                            (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject())
                                                            .then(function () { showToast("Invite link copied"); })
                                                            .catch(function () { showToast("Share this code: " + qrCur.code); });
                                                        }
                                                        
                                                        function shareQr() {
                                                            if (!qrCur) return;
                                                            var rec = qrCur;
                                                            $("evqr-canvas").toBlob(async function (b) {
                                                                var url = inviteUrl(rec.code);
                                                                var text = "Join " + rec.name + " on THE ARTcher · code " + rec.code;
                                                                try {
                                                                    if (b) {
                                                                        var f = new File([b], "artcher-event-" + rec.code + ".png", { type: "image/png" });
                                                                        if (navigator.canShare && navigator.canShare({ files: [f] })) {
                                                                            await navigator.share({ files: [f], title: rec.name, text: text, url: url });
                                                                            return;
                                                                        }
                                                                    }
                                                                    if (navigator.share) { await navigator.share({ title: rec.name, text: text, url: url }); return; }
                                                                } catch (e) { if (e && e.name === "AbortError") return; }
                                                                copyQrLink();
                                                            }, "image/png");
                                                        }
                                                        
                                                        function saveQr() {
                                                            if (!qrCur) return;
                                                            var code = qrCur.code;
                                                            $("evqr-canvas").toBlob(function (b) {
                                                                if (!b) { showToast("Could not create the PNG."); return; }
                                                                downloadBlob(b, "artcher-event-" + code + ".png");
                                                                showToast("QR saved ✓");
                                                            }, "image/png");
                                                        }
                                                        
                                                        // show the QR right after the user hosts a new event
                                                        wrap("hostEvent", function (o) {
                                                            return function () {
                                                                var before = curEvent && curEvent.code;
                                                                return Promise.resolve(o.apply(this, arguments)).then(function (r) {
                                                                    if (curEvent && curEvent.code !== before && hostToken(curEvent.code)) {
                                                                        closeEventModal();
                                                                        openEventQR(curEvent);
                                                                    }
                                                                    return r;
                                                                });
                                                            };
                                                        });
                                                        
                                                        // ======================================================================
                                                        // UI: Event Library & Event QR Modals + More Tab Integration (Icon-First)
                                                        // ======================================================================
                                                        var EV_UI_ICONS = {
                                                            library:  '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
                                                            qr:       '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3h-3zM19 14h2v2h-2zM14 19h2v2h-2zM18 18h3v3h-3z"/></svg>',
                                                            close:    '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
                                                            copy:     '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
                                                            link:     '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
                                                            share:    '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.6" y1="13.5" x2="15.4" y2="17.5"/><line x1="15.4" y1="6.5" x2="8.6" y2="10.5"/></svg>',
                                                            download: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
                                                            calendar: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>'
                                                        };
                                                        
                                                        // Expose openEventLibrary alias so the revamped Event modal button works directly
                                                        window.openEventLibrary = function () { openLib(); };
                                                        
                                                        function buildUI() {
                                                            // 1. EVENT LIBRARY MODAL
                                                            var lib = mk("div", "modal-backdrop");
                                                            lib.id = "evlib-modal";
                                                            lib.onclick = function (e) { if (e.target === lib) closeLib(); };
                                                            lib.innerHTML =
                                                            '<div class="modal-box evlib-box" role="dialog" aria-modal="true" aria-labelledby="evlib-title">' +
                                                            '<div class="modal-head">' +
                                                            '<div class="ev-head-title">' +
                                                            '<span class="ev-head-ico" aria-hidden="true">' + EV_UI_ICONS.library + '</span>' +
                                                            '<h3 id="evlib-title">Event library</h3>' +
                                                            '</div>' +
                                                            '<button type="button" class="btn btn-sm ev-icon-only" id="evlib-close" aria-label="Close" title="Close">' + EV_UI_ICONS.close + '</button>' +
                                                            '</div>' +
                                                            '<p class="evlib-sub">Events you joined or hosted. Archived events open read-only.</p>' +
                                                            '<div class="evlib-list" id="evlib-list"></div>' +
                                                            '</div>';
                                                            document.body.appendChild(lib);
                                                            $("evlib-close").onclick = closeLib;
                                                            
                                                            // 2. EVENT QR MODAL
                                                            var qr = mk("div", "modal-backdrop");
                                                            qr.id = "evqr-modal";
                                                            qr.onclick = function (e) { if (e.target === qr) closeEventQR(); };
                                                            qr.innerHTML =
                                                            '<div class="modal-box evqr-box" role="dialog" aria-modal="true" aria-labelledby="evqr-title">' +
                                                            '<div class="modal-head">' +
                                                            '<div class="ev-head-title">' +
                                                            '<span class="ev-head-ico" aria-hidden="true">' + EV_UI_ICONS.qr + '</span>' +
                                                            '<h3 id="evqr-title">Event QR code</h3>' +
                                                            '</div>' +
                                                            '<button type="button" class="btn btn-sm ev-icon-only" id="evqr-close" aria-label="Close" title="Close">' + EV_UI_ICONS.close + '</button>' +
                                                            '</div>' +
                                                            '<div class="evqr-frame">' +
                                                            '<div class="evqr-wrap"><canvas id="evqr-canvas" width="720" height="900"></canvas></div>' +
                                                            '</div>' +
                                                            '<div class="cap-msg" id="evqr-msg"></div>' +
                                                            '<div class="evqr-actions">' +
                                                            '<button type="button" class="btn ev-ico-btn" id="evqr-copy-code">' + EV_UI_ICONS.copy + '<span>Copy code</span></button>' +
                                                            '<button type="button" class="btn ev-ico-btn" id="evqr-copy">' + EV_UI_ICONS.link + '<span>Copy link</span></button>' +
                                                            '<button type="button" class="btn ev-ico-btn" id="evqr-share">' + EV_UI_ICONS.share + '<span>Share</span></button>' +
                                                            '<button type="button" class="btn btn-accent ev-ico-btn" id="evqr-save">' + EV_UI_ICONS.download + '<span>Save PNG</span></button>' +
                                                            '</div>' +
                                                            '</div>';
                                                            document.body.appendChild(qr);
                                                            
                                                            $("evqr-close").onclick = closeEventQR;
                                                            $("evqr-copy-code").onclick = function () { if (typeof copyEventCode === "function") copyEventCode(); };
                                                            $("evqr-copy").onclick = copyQrLink;
                                                            $("evqr-share").onclick = shareQr;
                                                            $("evqr-save").onclick = saveQr;
                                                            
                                                            document.addEventListener("keydown", function (e) {
                                                                if (e.key !== "Escape") return;
                                                                if (qr.classList.contains("open")) closeEventQR();
                                                                else if (lib.classList.contains("open")) closeLib();
                                                            });
                                                            
                                                            // 3. MORE TAB: Insert Event Library row inside "Events & Wall" (or legacy "Events") card
                                                            var cards = document.querySelectorAll("#view-more .card");
                                                            for (var i = 0; i < cards.length; i++) {
                                                                var h = cards[i].querySelector(".card-head");
                                                                var headTxt = h ? h.textContent.trim() : "";
                                                                if (headTxt === "Events & Wall" || headTxt === "Events") {
                                                                    var row = mk("button", "list-row");
                                                                    row.type = "button";
                                                                    row.innerHTML =
                                                                    '<span class="lead">' + EV_UI_ICONS.library +
                                                                    '<span>Event library<small id="evlib-more-sub">Events you join or host are saved here</small></span></span>';
                                                                    row.onclick = openLib;
                                                                    var firstBtn = cards[i].querySelector("button.list-row");
                                                                    if (firstBtn && firstBtn.nextSibling) cards[i].insertBefore(row, firstBtn.nextSibling);
                                                                    else cards[i].appendChild(row);
                                                                    break;
                                                                }
                                                            }
                                                            
                                                            // 4. OPTIONS: Open-in-app switch
                                                            var opt = $("opt-grid"), optCard = opt && opt.closest(".card");
                                                            if (optCard && !$("opt-open-app")) {
                                                                var lab = mk("label", "list-row");
                                                                lab.innerHTML =
                                                                '<span>Open links in the app<small>Android: jump to ARTcher when it is installed</small></span>' +
                                                                '<span class="switch"><input type="checkbox" id="opt-open-app"></span>';
                                                                optCard.appendChild(lab);
                                                                var cb = lab.querySelector("input");
                                                                cb.checked = lsGet(LS_OPENAPP, true) !== false;
                                                                cb.onchange = function () {
                                                                    lsSet(LS_OPENAPP, cb.checked);
                                                                    showToast(cb.checked ? "Links will open in the app" : "Links stay in the browser");
                                                                };
                                                            }
                                                        }
                                                        
                                                        // ======================================================================
                                                        // 5. OPEN IN THE ANDROID APP (com.artcher.app)
                                                        // ======================================================================
                                                        function inApp() {
                                                            var ua = navigator.userAgent || "", p = new URLSearchParams(location.search);
                                                            return typeof window.AndroidRadio !== "undefined" || typeof window.AndroidHaptic !== "undefined" ||
                                                            /; wv\)/i.test(ua) || p.get("app") === "1" || p.get("source") === "apk" ||
                                                            (document.referrer || "").indexOf("android-app://") === 0 ||
                                                            (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches);
                                                        }
                                                        
                                                        function intentUrl() {
                                                            var fb = new URL(location.href);
                                                            fb.searchParams.set("noapp", "1");      // fallback page must not retry (no loop)
                                                            return "intent://" + location.host + location.pathname + location.search +
                                                            "#Intent;scheme=" + location.protocol.replace(":", "") +
                                                            ";package=" + APP_PKG +
                                                            ";S.browser_fallback_url=" + encodeURIComponent(fb.href) + ";end";
                                                        }
                                                        
                                                        function showAppBar() {
                                                            try { if (sessionStorage.getItem(SS_BAR)) return; } catch (e) {}
                                                            var bar = mk("div", "app-open-bar"); bar.setAttribute("role", "region");
                                                            bar.setAttribute("aria-label", "Open in app");
                                                            var t = mk("div", "aob-text");
                                                            t.append(mk("strong", "", "Open in the ARTcher app"), mk("small", "", "Faster canvas, fullscreen and offline"));
                                                            var go = mk("button", "btn btn-accent btn-sm", "Open"); go.type = "button";
                                                            go.onclick = function () { location.href = intentUrl(); };       // a tap is a user gesture, Chrome allows it
                                                            var x = mk("button", "btn btn-sm", "✕"); x.type = "button"; x.setAttribute("aria-label", "Dismiss");
                                                            x.onclick = function () { bar.remove(); try { sessionStorage.setItem(SS_BAR, "1"); } catch (e) {} };
                                                            bar.append(t, go, x);
                                                            document.body.appendChild(bar);
                                                        }
                                                        
                                                        async function initOpenInApp() {
                                                            if (!/Android/i.test(navigator.userAgent) || inApp()) return;
                                                            if (lsGet(LS_OPENAPP, true) === false) return;
                                                            if (new URLSearchParams(location.search).get("noapp") === "1") return;
                                                            
                                                            
                                                            try {
                                                                if (navigator.getInstalledRelatedApps) {
                                                                    var apps = await navigator.getInstalledRelatedApps();
                                                                    if (apps.some(function (a) { return a.id === APP_PKG; })) {
                                                                        ["apk-prompt-card", "more-apk-card"].forEach(function (id) { var e = $(id); if (e) e.hidden = true; });
                                                                    }
                                                                }
                                                            } catch (e) {}
                                                            
                                                            showAppBar();
                                                            try {
                                                                if (!sessionStorage.getItem(SS_TRY)) {
                                                                    sessionStorage.setItem(SS_TRY, "1");
                                                                    location.replace(intentUrl());
                                                                }
                                                            } catch (e) {}
                                                        }
                                                        
                                                        buildUI();
                                                        if (curEvent) libUpsert(curEvent, true);
                                                        renderLib();
                                                        applyDrawLock();
                                                        setInterval(applyDrawLock, 5000);
                                                        initOpenInApp();
                                                    })();
                                                    
                                                    (function () {
                                                        "use strict";
                                                        var $ = function (id) { return document.getElementById(id); };
                                                        var d = document, root = d.documentElement;
                                                        
                                                        var tileScratch = d.createElement("canvas");
                                                        tileScratch.width = tileScratch.height = 500;
                                                        var tileScratchCtx = tileScratch.getContext("2d", { willReadFrequently: true });
                                                        
                                                        window.getCachedTileCanvas = function (entry) {
                                                            var hit = tileBitmapCache.get(entry.id);
                                                            if (hit) return hit;
                                                            var list = entry.strokes || [];
                                                            tileScratchCtx.clearRect(0, 0, 500, 500);
                                                            renderStrokesInstant(tileScratchCtx, list, 500, true);
                                                            var cvs = d.createElement("canvas");
                                                            cvs.width = cvs.height = 256;
                                                            var c = cvs.getContext("2d");
                                                            c.fillStyle = bgOf(list);
                                                            c.fillRect(0, 0, 256, 256);
                                                            c.imageSmoothingEnabled = true;
                                                            c.imageSmoothingQuality = "high";
                                                            c.drawImage(tileScratch, 0, 0, 256, 256);
                                                            tileBitmapCache.set(entry.id, cvs);
                                                            return cvs;
                                                        };
                                                        try { tileBitmapCache.clear(); scheduleWallPaint(); } catch (e) {}
                                                        
                                                        /* ======================================================================
                                                        2. POST SIZE METER (moved out of the draw-hud)
                                                        ====================================================================== */
                                                        window.refreshSizeUI = function () {
                                                            window.sizeTimer = 0;
                                                            var mb = estimatePayloadMB();
                                                            window.lastSizeMB = mb;
                                                            var ratio = mb / POST_WARN_MB;
                                                            var state = mb === 0 ? "empty" : ratio >= 1 ? "big" : ratio >= 0.6 ? "mid" : "ok";
                                                            var hints = {
                                                                empty: "Your canvas is blank show us what you've got!",
                                                                ok: "Super nice work! You can post it now.",
                                                                mid: "Looking great lots of nice touches!",
                                                                big: "True masterpiece give it a few extra seconds to post"
                                                            };
                                                            var meter = $("post-meter"), val = $("pm-val"), fill = $("pm-fill"), hint = $("pm-hint"), dot = $("post-tab-dot");
                                                            if (meter) meter.dataset.state = state;
                                                            if (val) val.textContent = fmtMB(mb);
                                                            if (fill) fill.style.width = (mb === 0 ? 0 : Math.max(4, Math.min(100, ratio * 100))) + "%";
                                                            if (hint) hint.textContent = hints[state];
                                                            if (dot) { dot.hidden = !(state === "mid" || state === "big"); dot.dataset.state = state; }
                                                        };
                                                        window.refreshSizeUI();
                                                        
                                                        /* ======================================================================
                                                        3. TWO-FINGER DOUBLE TAP = REDO
                                                        ====================================================================== */
                                                        (function () {
                                                            var frame = $("canvas-frame");
                                                            if (!frame) return;
                                                            var snapRedo = [], active = false, travel = false, t0 = 0, p0 = [], sc0 = 1, lastTap = 0;
                                                            
                                                            frame.addEventListener("touchstart", function (e) {
                                                                if (e.touches.length === 1) {
                                                                    try { snapRedo = window.redoStack.slice(); } catch (_) { snapRedo = []; }
                                                                } else if (e.touches.length === 2) {
                                                                    if (currentStroke && currentStroke.p && currentStroke.p.length <= 2 && snapRedo.length) {
                                                                        try { window.redoStack = snapRedo.slice(); updateHistoryUI(); } catch (_) {}
                                                                    }
                                                                    active = true; travel = false; t0 = performance.now(); sc0 = studioScale;
                                                                    p0 = [[e.touches[0].clientX, e.touches[0].clientY], [e.touches[1].clientX, e.touches[1].clientY]];
                                                                } else {
                                                                    active = false;
                                                                }
                                                            }, { capture: true, passive: true });
                                                            
                                                            frame.addEventListener("touchmove", function (e) {
                                                                if (!active || e.touches.length !== 2) return;
                                                                for (var i = 0; i < 2; i++) {
                                                                    if (Math.hypot(e.touches[i].clientX - p0[i][0], e.touches[i].clientY - p0[i][1]) > 14) travel = true;
                                                                }
                                                            }, { passive: true });
                                                            
                                                            frame.addEventListener("touchcancel", function () { active = false; }, { passive: true });
                                                            
                                                            frame.addEventListener("touchend", function (e) {
                                                                if (!active || e.touches.length > 0) return;
                                                                active = false;
                                                                var now = performance.now();
                                                                if (now - t0 > 280 || travel || Math.abs(studioScale - sc0) > 0.02) { lastTap = 0; return; }
                                                                if (now - lastTap < 420) {
                                                                    lastTap = 0;
                                                                    if (window.redoStack.length) { redoStroke(); showToast("Redo"); haptic(10); }
                                                                    else showToast("Nothing to redo");
                                                                } else {
                                                                    lastTap = now;
                                                                }
                                                            }, { passive: true });
                                                            
                                                            window.addEventListener("keydown", function (e) {
                                                                if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "y") return;
                                                                if (currentView !== "draw") return;
                                                                var ae = d.activeElement;
                                                                if (ae && (ae.tagName === "INPUT" || ae.isContentEditable)) return;
                                                                e.preventDefault();
                                                                redoStroke();
                                                            });
                                                        })();
                                                        
                                                        /* ======================================================================
                                                        4. WALL: WHITEBOARD-ONLY FULLSCREEN
                                                        ====================================================================== */
                                                        var askedFs = false;
                                                        function fsOn() { return !!(d.fullscreenElement || d.webkitFullscreenElement); }
                                                        
                                                        function relayout() {
                                                            setTimeout(function () {
                                                                window.dispatchEvent(new Event("resize"));
                                                                try { if (currentView === "wall" && !userMoved) fitWallToScreen(); scheduleWallPaint(); } catch (e) {}
                                                            }, 60);
                                                        }
                                                        
                                                        function setWallClean(on) {
                                                            on = !!on;
                                                            if (on === d.body.classList.contains("wall-clean")) return;
                                                            if (on && currentView !== "wall") switchView("wall");
                                                            d.body.classList.toggle("wall-clean", on);
                                                            var x = $("wall-clean-exit");
                                                            if (x) x.hidden = !on;
                                                            try {
                                                                if (on && (d.fullscreenEnabled || d.webkitFullscreenEnabled) && !fsOn()) {
                                                                    askedFs = true;
                                                                    var p = (root.requestFullscreen || root.webkitRequestFullscreen).call(root);
                                                                    if (p && p.catch) p.catch(function () { askedFs = false; });
                                                                } else if (!on && fsOn()) {
                                                                    askedFs = false;
                                                                    (d.exitFullscreen || d.webkitExitFullscreen).call(d);
                                                                }
                                                            } catch (e) { askedFs = false; }
                                                            if (on) showToast("Whiteboard mode · tap ✕ or press Esc to exit");
                                                            haptic(8);
                                                            relayout();
                                                        }
                                                        window.setWallClean = setWallClean;
                                                        window.toggleWallClean = function (force) {
                                                            setWallClean(typeof force === "boolean" ? force : !d.body.classList.contains("wall-clean"));
                                                        };
                                                        
                                                        (function () {
                                                            var xb = d.createElement("button");
                                                            xb.id = "wall-clean-exit";
                                                            xb.type = "button";
                                                            xb.className = "wall-clean-exit";
                                                            xb.hidden = true;
                                                            xb.textContent = "✕";
                                                            xb.setAttribute("aria-label", "Exit whiteboard mode");
                                                            xb.onclick = function () { setWallClean(false); };
                                                            $("view-wall").appendChild(xb);
                                                        })();
                                                        
                                                        ["fullscreenchange", "webkitfullscreenchange"].forEach(function (ev) {
                                                            d.addEventListener(ev, function () {
                                                                if (askedFs && !fsOn() && d.body.classList.contains("wall-clean")) { askedFs = false; setWallClean(false); }
                                                            });
                                                        });
                                                        d.addEventListener("keydown", function (e) {
                                                            if (e.key === "Escape" && d.body.classList.contains("wall-clean") && !fsOn()) setWallClean(false);
                                                        });
                                                        
                                                        var _sv = window.switchView;
                                                        window.switchView = function (name) {
                                                            if (name !== "wall" && d.body.classList.contains("wall-clean")) setWallClean(false);
                                                            var r = _sv.apply(this, arguments);
                                                            if (name === "more") loadVersionInfo(false);
                                                            return r;
                                                        };
                                                        
                                                        /* ======================================================================
                                                        5. VERSION.JSON: APK link, appVersion, in-app "Download Update"
                                                        ====================================================================== */
                                                        var LS_VER = "fw_version_info_v1";
                                                        var LS_WHATS_NEW_VER = "fw_whats_new_app_version_v1";
                                                        var ver = lsGet(LS_VER, null);
                                                        if (!lsGet(LS_WHATS_NEW_VER, null) && ver && ver.appVersion) lsSet(LS_WHATS_NEW_VER, ver.appVersion);
                                                        var lastVerFetch = 0;

                                                        window.closeWhatsNewModal = function () {
                                                            var modal = $("whats-new-modal");
                                                            if (modal) modal.classList.remove("open");
                                                            window.setTimeout(function () { window.maybePromptTutorial(); }, 150);
                                                        };
                                                        window.showWhatsNewModal = function (info) {
                                                            if (focusModeActive) { pendingWhatsNew = info; return; }
                                                            var modal = $("whats-new-modal");
                                                            if (!modal) return;
                                                            $("whats-new-version").textContent = "v" + info.appVersion;
                                                            $("whats-new-copy").textContent = String(info.siteChangeLog || "Website improvements and updates are ready.").trim();
                                                            lsSet(LS_WHATS_NEW_VER, info.appVersion);
                                                            modal.classList.add("open");
                                                        };
                                                        window.flushPendingWhatsNew = function () {
                                                            if (!focusModeActive && pendingWhatsNew) {
                                                                var info = pendingWhatsNew;
                                                                pendingWhatsNew = null;
                                                                window.showWhatsNewModal(info);
                                                            }
                                                        };
                                                        
                                                        function hasNativeUpdate() { return !!(window.Android && typeof window.Android.checkForUpdate === "function"); }
                                                        function inAppShell() { return typeof window.AndroidRadio !== "undefined" || typeof window.Android !== "undefined"; }
                                                        function nativeInfo() {
                                                            try {
                                                                if (window.Android && typeof window.Android.getVersionInfo === "function") return JSON.parse(window.Android.getVersionInfo() || "{}");
                                                            } catch (e) {}
                                                            return {};
                                                        }
                                                        
                                                        function applyVersion() {
                                                            var ni = nativeInfo();
                                                            
                                                            // 1) APK links follow apkUrl
                                                            if (ver && ver.apkUrl) {
                                                                ["apk-prompt-link", "more-apk-link"].forEach(function (id) { var a = $(id); if (a) a.href = ver.apkUrl; });
                                                            }
                                                            var sm = d.querySelector("#more-apk-link small");
                                                            if (sm && ver && ver.versionName) sm.textContent = "Latest v" + ver.versionName + " · use this app for offline drawing";
                                                            
                                                            // 2) appVersion under "ARCHERSTUDIO @ 2026"
                                                            var line = $("app-version-line");
                                                            if (line) {
                                                                var parts = [];
                                                                if (ver && ver.appVersion) parts.push("v" + ver.appVersion);
                                                                if (ni.versionName) parts.push("App version " + ni.versionName);
                                                                line.textContent = parts.join(" · ");
                                                                line.hidden = !parts.length;
                                                            }
                                                            
                                                            // 3) update card (only inside the Android app)
                                                            var card = $("update-card");
                                                            if (!card) return;
                                                            card.hidden = !inAppShell();
                                                            var has = !!(ver && ver.versionCode && ni.versionCode && ver.versionCode > ni.versionCode);
                                                            var title = $("update-title"), sub = $("update-sub"), pill = $("update-pill");
                                                            if (title) title.textContent = has ? "Install Update" : (hasNativeUpdate() ? "Check for updates" : "Update the app");
                                                            if (sub) {
                                                                if (has) sub.textContent = "v" + ver.versionName + " available · you have v" + ni.versionName;
                                                                else if (ni.versionName) sub.textContent = "You have v" + ni.versionName + (ver && ver.versionName ? " · latest v" + ver.versionName : "");
                                                                else sub.textContent = ver && ver.versionName ? "Latest v" + ver.versionName : "Tap to check";
                                                            }
                                                            if (pill) pill.hidden = !has;
                                                        }
                                                        
                                                        function loadVersionInfo(force) {
                                                            if (!force && Date.now() - lastVerFetch < 60000) return Promise.resolve();
                                                            lastVerFetch = Date.now();
                                                            return fetch("download/version.json?_t=" + Date.now(), { cache: "no-store" })
                                                            .then(function (r) { return r.ok ? r.json() : null; })
                                                            .then(function (j) {
                                                                if (j && typeof j === "object") {
                                                                    ver = j;
                                                                    lsSet(LS_VER, j);
                                                                    if (j.appVersion) {
                                                                        var seenVersion = lsGet(LS_WHATS_NEW_VER, null);
                                                                        if (seenVersion && String(seenVersion) !== String(j.appVersion)) window.showWhatsNewModal(j);
                                                                        else if (!seenVersion) lsSet(LS_WHATS_NEW_VER, j.appVersion);
                                                                    }
                                                                }
                                                                applyVersion();
                                                            })
                                                            .catch(function () { applyVersion(); });
                                                        }
                                                        
                                                        window.runUpdateAction = function () {
                                                            haptic(8);
                                                            if (hasNativeUpdate()) {
                                                                window.Android.checkForUpdate();
                                                            } else if (ver && ver.apkUrl) {
                                                                showToast("This app version can't self-install. Downloading the APK, tap it when finished.");
                                                                window.location.href = ver.apkUrl;
                                                            } else {
                                                                loadVersionInfo(true).then(function () { showToast(ver ? "Latest v" + ver.versionName : "Couldn't reach the server."); });
                                                            }
                                                        };
                                                        
                                                        applyVersion();
                                                        loadVersionInfo(true);
                                                    })();
                                                    (function () {
                                                        "use strict";
                                                        var $ = function (id) { return document.getElementById(id); };
                                                        var mk = function (t, c, x) { var e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
                                                        function wrap(name, make) { var o = window[name]; if (typeof o === "function") window[name] = make(o); }
                                                        
                                                        var LS_NOTIFS = "fw_notifs_v3", LS_NPREFS = "fw_notif_prefs_v3", LS_NREAD = "fw_notif_read_v3",
                                                        LS_NLAST = "fw_notif_last_v3", LS_DEV = "fw_device_v3", LS_JOINED = "fw_joined_v3", LS_LIB = "fw_event_library_v1";
                                                        
                                                        var deviceId = lsGet(LS_DEV, null);
                                                        if (!deviceId) { deviceId = "d_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); lsSet(LS_DEV, deviceId); }
                                                        
                                                        function hasPush() { return typeof window.AndroidPush !== "undefined" && window.AndroidPush !== null; }
                                                        function userKey() { return (userProfile && userProfile.userKey) || voterId; }
                                                        function myName() { return (userProfile && !userProfile.anonymous && userProfile.name) ? userProfile.name : ""; }
                                                        function gasGet(params) {
                                                            var q = new URLSearchParams(Object.assign({ _t: Date.now() }, params));
                                                            return fetch(GAS_WEB_APP_URL + "?" + q.toString()).then(function (r) { return r.json(); });
                                                        }
                                                        
                                                        /* =====================================================================
                                                        0. tag outgoing posts with the user key
                                                        ===================================================================== */
                                                        var _fetch = window.fetch;
                                                        window.fetch = function (input, init) {
                                                            try {
                                                                var url = typeof input === "string" ? input : ((input && input.url) || "");
                                                                if (init && init.method === "POST" && typeof init.body === "string" && url.indexOf(GAS_WEB_APP_URL) === 0) {
                                                                    var b = JSON.parse(init.body), touched = true;
                                                                    if (b.action === "addFreedomWall") b.owner = userKey();
                                                                    else if (b.action === "reactFreedomWall") { b.by = userKey(); b.byName = myName(); }
                                                                    else if (b.action === "createFWEvent") b.owner = userKey();
                                                                    else touched = false;
                                                                    if (touched) init = Object.assign({}, init, { body: JSON.stringify(b) });
                                                                }
                                                            } catch (e) {}
                                                            return _fetch.call(window, input, init);
                                                        };
                                                        
                                                        /* =====================================================================
                                                        1. LOGIN / REGISTER / GUEST (Clean 5-field account)
                                                        ===================================================================== */
                                                        var EYE_OPEN = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
                                                        var EYE_OFF  = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
                                                        
                                                        function F(id, label, attrs) {
                                                            return '<label class="auth-field"><span class="auth-lab">' + label + '</span><input class="name-input" id="' + id + '" ' + (attrs || "") + '></label>';
                                                        }
                                                        
                                                        function FPW(id, label, attrs, rightHtml) {
                                                            return '<div class="auth-field">' +
                                                            '<div class="auth-lab-row"><label class="auth-lab" for="' + id + '">' + label + '</label>' + (rightHtml || '') + '</div>' +
                                                            '<div class="pw-wrap">' +
                                                            '<input class="name-input pw-input" id="' + id + '" type="password" ' + (attrs || "") + '>' +
                                                            '<button type="button" class="pw-eye" data-pw-for="' + id + '" aria-label="Show password" aria-pressed="false" title="Show password">' + EYE_OPEN + '</button>' +
                                                            '</div>' +
                                                            '</div>';
                                                        }
                                                        
                                                        var AUTH_HTML =
                                                        '<div class="nickname-overlay" id="auth-overlay" hidden role="dialog" aria-modal="true" aria-labelledby="auth-title"><div class="nickname-card auth-card">' +
                                                        '<div class="nickname-logo"><img src="../resources/image/logo/logo4.png" alt="" onerror="this.style.display=\'none\'"><span>ARCHERSTUDIO</span></div>' +
                                                        '<div class="auth-head">' +
                                                        '<h2 class="nickname-title" id="auth-title">Welcome to THE ARTcher</h2>' +
                                                        '</div>' +
                                                        '<div class="auth-tabs" role="tablist"><button type="button" class="auth-tab" data-t="login">Log in</button><button type="button" class="auth-tab" data-t="register">Register</button><button type="button" class="auth-tab" data-t="guest">Guest</button></div>' +
                                                        
                                                        '<form class="auth-pane" id="auth-form-login" data-pane="login" autocomplete="on">' +
                                                        F("al-id", "Username or Email", 'autocomplete="username" maxlength="80" placeholder="you@example.com"') +
                                                        FPW("al-pw", "Password", 'autocomplete="current-password" maxlength="64" placeholder="Enter your password"',
                                                            '<button type="button" class="auth-link auth-inline" data-go="reset">Forgot password?</button>') +
                                                            '<div class="auth-caps" id="al-caps" hidden>Caps Lock is on</div>' +
                                                            '<div class="auth-msg" id="al-msg"></div>' +
                                                            '<button type="submit" class="btn btn-accent btn-lg btn-block">Log in</button>' +
                                                            '<div class="auth-foot">New here? <button type="button" class="auth-link auth-inline" data-go="register">Create an account</button></div>' +
                                                            '</form>' +
                                                            
                                                            '<form class="auth-pane" id="auth-form-reset" data-pane="reset">' +
                                                            '<div class="auth-note">Enter your account email and we will send a 6-digit reset code.</div>' +
                                                            F("ar-email", "Email", 'type="email" maxlength="80" placeholder="you@example.com"') +
                                                            '<button type="button" class="btn btn-block" id="ar-send">Send verification code</button>' +
                                                            '<div id="ar-code-wrap" hidden style="display:flex;flex-direction:column;gap:10px">' +
                                                            F("ar-code", "6-digit code", 'inputmode="numeric" maxlength="6" placeholder="000000" style="letter-spacing:.25em;font-weight:700;text-align:center"') +
                                                            FPW("ar-pw", "New password (6+)", 'autocomplete="new-password" maxlength="64" placeholder="Create a new password"') +
                                                            '</div>' +
                                                            '<div class="auth-msg" id="ar-msg"></div>' +
                                                            '<button type="submit" class="btn btn-accent btn-lg btn-block" id="ar-submit" hidden>Reset password &amp; log in</button>' +
                                                            '<button type="button" class="auth-link" data-go="login">&larr; Back to log in</button>' +
                                                            '</form>' +
                                                            
                                                            '<form class="auth-pane" id="auth-form-reg" data-pane="register" autocomplete="on">' +
                                                            F("rg-name", "Full name", 'autocomplete="name" maxlength="60" placeholder="e.g. Juan Luna"') +
                                                            F("rg-user", "Username", 'autocomplete="username" maxlength="24" placeholder="letters, numbers, _"') +
                                                            '<div class="auth-handle" id="rg-handle" hidden></div>' +
                                                            F("rg-email", "Email", 'type="email" autocomplete="email" maxlength="80" placeholder="you@example.com"') +
                                                            F("rg-bday", "Birthday <opt>(optional)</opt>", 'type="date"') +
                                                            FPW("rg-pw", "Password (6+ characters)", 'autocomplete="new-password" maxlength="64" placeholder="At least 6 characters"') +
                                                            '<div class="pw-meter" id="rg-pw-meter" hidden><i></i><i></i><i></i><span id="rg-pw-label">Weak</span></div>' +
                                                            '<input class="auth-hp" id="rg-web" tabindex="-1" autocomplete="off" aria-hidden="true">' +
                                                            '<div class="auth-msg" id="rg-msg"></div>' +
                                                            '<button type="submit" class="btn btn-accent btn-lg btn-block">Create account</button>' +
                                                            '</form>' +
                                                            
                                                            '<form class="auth-pane" id="auth-form-guest" data-pane="guest">' +
                                                            '<div class="auth-note">guests can draw and post right away.</div>' +
                                                            '<input type="text" id="ag-nick" class="name-input" maxlength="24" placeholder="Nickname" autocomplete="off">' +
                                                            '<label class="anon-check-row" for="ag-anon"><input type="checkbox" id="ag-anon"><span>Or stay anonymous</span></label>' +
                                                            '<div class="auth-msg" id="ag-msg"></div>' +
                                                            '<button type="submit" class="btn btn-accent btn-lg btn-block">Continue as guest</button>' +
                                                            '</form>' +
                                                            '<button type="button" class="btn btn-block" id="auth-cancel" hidden>Cancel</button>' +
                                                            '</div></div>';
                                                            
                                                            var TAB_SUBS = {
                                                                login: "Sign in to sync your tiles, likes, and alerts.",
                                                                register: "Create your artist profile across all devices.",
                                                                guest: "No account needed — draw and post right away.",
                                                                reset: "Recover access to your ARCHERSTUDIO account."
                                                            };
                                                            
                                                            var authCancellable = false;
                                                            function authMsg(id, text, ok) { var m = $(id); if (m) { m.textContent = text || ""; m.classList.toggle("ok", !!ok); } }
                                                            function busy(form, on) {
                                                                form.querySelectorAll("button,input,select").forEach(function (x) { x.disabled = on; });
                                                                var s = form.querySelector('button[type="submit"]'); if (s) s.classList.toggle("is-busy", on);
                                                            }
                                                            function setTab(name) {
                                                                document.querySelectorAll("#auth-overlay .auth-pane").forEach(function (p) { p.classList.toggle("active", p.dataset.pane === name); });
                                                                document.querySelectorAll("#auth-overlay .auth-tab").forEach(function (t) { t.classList.toggle("active", t.dataset.t === name || (name === "reset" && t.dataset.t === "login")); });
                                                                var sub = $("auth-sub"); if (sub && TAB_SUBS[name]) sub.textContent = TAB_SUBS[name];
                                                            }
                                                            function openAuth(tab, cancellable) {
                                                                if (focusModeActive && tab !== "guest") return;
                                                                authCancellable = !!cancellable;
                                                                $("auth-cancel").hidden = !cancellable;
                                                                var g = $("ag-nick"), a = $("ag-anon");
                                                                if (userProfile && !userProfile.account) { a.checked = !!userProfile.anonymous; g.value = userProfile.name || ""; g.disabled = a.checked; }
                                                                setTab(tab || "login");
                                                                $("auth-overlay").hidden = false;
                                                            }
                                                            function closeAuth() {
                                                                $("auth-overlay").hidden = true;
                                                                window.setTimeout(function () { window.maybePromptTutorial(); }, 450);
                                                            }
                                                            
                                                            function applyAccount(p) {
                                                                userProfile = {
                                                                    name: p.fullName || p.username || "Artist",
                                                                    username: p.username || "",
                                                                    email: p.email || "",
                                                                    anonymous: false,
                                                                    account: true,
                                                                    userKey: p.userKey
                                                                };
                                                                lsSet(LS_PROFILE, userProfile);
                                                                applyProfileUI(); closeAuth(); haptic(12);
                                                                showToast("Welcome, " + userProfile.name + "!");
                                                                onKeyChanged();
                                                            }
                                                            function val(id) { return ($(id).value || "").trim(); }
                                                            
                                                            function buildAuth() {
                                                                document.body.insertAdjacentHTML("beforeend", AUTH_HTML);
                                                                document.querySelectorAll("#auth-overlay .auth-tab").forEach(function (t) { t.onclick = function () { setTab(t.dataset.t); }; });
                                                                document.querySelectorAll("#auth-overlay [data-go]").forEach(function (b) { b.onclick = function () { setTab(b.dataset.go); }; });
                                                                
                                                                document.querySelectorAll("#auth-overlay .pw-eye").forEach(function (btn) {
                                                                    btn.onclick = function () {
                                                                        var password = $(btn.dataset.pwFor);
                                                                        if (!password) return;
                                                                        var visible = password.type === "password";
                                                                        password.type = visible ? "text" : "password";
                                                                        btn.innerHTML = visible ? EYE_OFF : EYE_OPEN;
                                                                        btn.setAttribute("aria-pressed", visible ? "true" : "false");
                                                                        btn.setAttribute("aria-label", visible ? "Hide password" : "Show password");
                                                                        btn.title = visible ? "Hide password" : "Show password";
                                                                        haptic(6);
                                                                    };
                                                                });
                                                                
                                                                var alPw = $("al-pw");
                                                                if (alPw) {
                                                                    ["keydown", "keyup"].forEach(function (ev) {
                                                                        alPw.addEventListener(ev, function (e) {
                                                                            var caps = e.getModifierState && e.getModifierState("CapsLock");
                                                                            var el = $("al-caps"); if (el) el.hidden = !caps;
                                                                        });
                                                                    });
                                                                }
                                                                
                                                                var rgUser = $("rg-user");
                                                                if (rgUser) {
                                                                    rgUser.oninput = function () {
                                                                        var clean = this.value.trim().replace(/^@+/, "");
                                                                        var h = $("rg-handle"); if (!h) return;
                                                                        h.hidden = !clean;
                                                                        h.textContent = clean ? "ARTist: @" + clean : "";
                                                                    };
                                                                }
                                                                
                                                                var rgPw = $("rg-pw");
                                                                if (rgPw) {
                                                                    rgPw.oninput = function () {
                                                                        var v = this.value || "", meter = $("rg-pw-meter"), lab = $("rg-pw-label");
                                                                        if (!meter) return;
                                                                        meter.hidden = !v.length;
                                                                        var score = 0;
                                                                        if (v.length >= 6) score++;
                                                                        if (v.length >= 10 || (/[A-Z]/.test(v) && /[0-9]/.test(v))) score++;
                                                                        if (/[^a-zA-Z0-9]/.test(v) && v.length >= 8) score++;
                                                                        meter.dataset.score = String(score);
                                                                        if (lab) lab.textContent = score <= 1 ? "Weak" : (score === 2 ? "Good" : "Strong");
                                                                    };
                                                                }
                                                                
                                                                $("auth-cancel").onclick = function () { if (authCancellable) closeAuth(); };
                                                                $("ag-anon").onchange = function () { $("ag-nick").disabled = this.checked; };
                                                                
                                                                $("auth-form-login").onsubmit = function (e) {
                                                                    e.preventDefault();
                                                                    var f = this, id = val("al-id"), pw = $("al-pw").value;
                                                                    if (!id || !pw) return authMsg("al-msg", "Enter your username/email and password.");
                                                                    busy(f, true); authMsg("al-msg", "");
                                                                    window.gasPost({ action: "authLogin", login: id, password: pw, deviceKey: voterId }).then(function (j) {
                                                                        if (j && j.ok) applyAccount(j.profile);
                                                                        else authMsg("al-msg", (j && j.error) || "Login failed.");
                                                                    }).catch(function () { authMsg("al-msg", "Couldn't reach the server."); }).then(function () { busy(f, false); });
                                                                };
                                                                
                                                                $("ar-send").onclick = function () {
                                                                    var b = this, email = val("ar-email");
                                                                    if (!email || email.indexOf("@") < 0) return authMsg("ar-msg", "Enter a valid email address.");
                                                                    b.disabled = true; authMsg("ar-msg", "");
                                                                    window.gasPost({ action: "authRequestCode", email: email }).then(function (j) {
                                                                        if (!j || !j.ok) return authMsg("ar-msg", (j && j.error) || "Couldn't send code.");
                                                                        $("ar-code-wrap").hidden = false;
                                                                        $("ar-submit").hidden = false;
                                                                        authMsg("ar-msg", "Code sent! Check your inbox (expires in 15 mins).", true);
                                                                    }).catch(function () { authMsg("ar-msg", "Couldn't reach the server."); }).then(function () { b.disabled = false; });
                                                                };
                                                                
                                                                $("auth-form-reset").onsubmit = function (e) {
                                                                    e.preventDefault();
                                                                    var f = this, pw = $("ar-pw").value;
                                                                    if (pw.length < 6) return authMsg("ar-msg", "Password needs at least 6 characters.");
                                                                    busy(f, true);
                                                                    window.gasPost({ action: "authResetPassword", email: val("ar-email"), code: val("ar-code"), password: pw, deviceKey: voterId }).then(function (j) {
                                                                        if (j && j.ok) applyAccount(j.profile); else authMsg("ar-msg", (j && j.error) || "Couldn't reset password.");
                                                                    }).catch(function () { authMsg("ar-msg", "Couldn't reach the server."); }).then(function () { busy(f, false); });
                                                                };
                                                                
                                                                $("auth-form-reg").onsubmit = function (e) {
                                                                    e.preventDefault();
                                                                    var f = this, pw = $("rg-pw").value;
                                                                    var body = {
                                                                        action: "authRegister",
                                                                        fullName: val("rg-name"),
                                                                        username: val("rg-user"),
                                                                        email: val("rg-email"),
                                                                        birthday: $("rg-bday").value,
                                                                        password: pw,
                                                                        website: val("rg-web"),
                                                                        deviceKey: voterId
                                                                    };
                                                                    if (!body.fullName || !body.username || !body.email) return authMsg("rg-msg", "Full name, username, and email are required.");
                                                                    if (!/^[a-zA-Z0-9_.-]{3,24}$/.test(body.username)) return authMsg("rg-msg", "Username must be 3–24 letters, numbers, or _ . -");
                                                                    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.email)) return authMsg("rg-msg", "That email address doesn't look right.");
                                                                    if (pw.length < 6) return authMsg("rg-msg", "Password needs at least 6 characters.");
                                                                    busy(f, true); authMsg("rg-msg", "");
                                                                    window.gasPost(body).then(function (j) {
                                                                        if (j && j.ok) applyAccount(j.profile); else authMsg("rg-msg", (j && j.error) || "Registration failed.");
                                                                    }).catch(function () { authMsg("rg-msg", "Couldn't reach the server."); }).then(function () { busy(f, false); });
                                                                };
                                                                
                                                                $("auth-form-guest").onsubmit = function (e) {
                                                                    e.preventDefault();
                                                                    var anon = $("ag-anon").checked, nick = val("ag-nick").slice(0, 24);
                                                                    if (!anon && !nick) return authMsg("ag-msg", "Enter a nickname or tick stay anonymous.");
                                                                    var wasKey = userKey();
                                                                    userProfile = { name: anon ? "" : nick, anonymous: anon };
                                                                    lsSet(LS_PROFILE, userProfile); applyProfileUI(); closeAuth(); haptic(10);
                                                                    showToast(anon ? "Staying anonymous" : "Welcome, " + nick + "!");
                                                                    if (wasKey !== userKey()) onKeyChanged(); else registerDevice();
                                                                };
                                                                
                                                                window.openNicknameOverlay = function (allowCancel) {
                                                                    if (userProfile && userProfile.account) { showToast("Your name comes from your account. Change the alias in the Post tab."); return; }
                                                                    openAuth("guest", !!allowCancel);
                                                                };
                                                                window.handleStudioAuthorInput = function (v) {
                                                                    var t = (v || "").trim().slice(0, 24);
                                                                    userProfile = Object.assign({}, userProfile || {}, { name: t, anonymous: !t });
                                                                    lsSet(LS_PROFILE, userProfile);
                                                                    var g = $("nav-greeting"), m = $("more-profile-name");
                                                                    if (g) { g.textContent = greetingFor(t); g.hidden = !g.textContent; }
                                                                    if (m) m.textContent = t || "Anonymous";
                                                                };
                                                            }
                                                            
                                                            function logout() {
                                                                askConsent("Log out?", "You'll keep drawing as a guest.", function () {
                                                                    var key = userKey();
                                                                    window.gasPost({ action: "fwUnregisterDevice", key: key, dev: deviceId }).catch(function () {});
                                                                    userProfile = { name: "", anonymous: true };
                                                                    lsSet(LS_PROFILE, userProfile); applyProfileUI(); onKeyChanged(); showToast("Logged out");
                                                                }, { danger: true, okLabel: "Log out" });
                                                            }
                                                            
                                                            function renderAccountCard() {
                                                                var c = $("acct-profile-card"); if (!c) return;
                                                                var acc = userProfile && userProfile.account;
                                                                $("acct-name").textContent = acc ? userProfile.name : (myName() || "Guest");
                                                                $("acct-sub").textContent = acc
                                                                ? "@" + userProfile.username + " • " + userProfile.email
                                                                : "Log in to keep your tiles";
                                                                var btn = $("acct-btn");
                                                                btn.textContent = acc ? "Log out" : "Log in / Register";
                                                                btn.classList.toggle("btn-primary", !acc);
                                                                
                                                                var aliasRow = $("edit-alias-row");
                                                                if (aliasRow) aliasRow.hidden = !!acc;
                                                            }
                                                            
                                                            /* =====================================================================
                                                            2. NOTIFICATIONS (Icon-First UI, Realtime Broadcast, Push & Preferences)
                                                            ===================================================================== */
                                                            var DEF_PREFS = { on: true, reactions: true, hostArt: true, eventUpdates: true, milestones: true, push: true };
                                                            function prefs() { return Object.assign({}, DEF_PREFS, lsGet(LS_NPREFS, {})); }
                                                            
                                                            var notifs = [], readSet = new Set(), lastTs = 0, liveChan = null, liveKey = "";
                                                            function nk(s) { return s + ":" + userKey(); }
                                                            function loadState() {
                                                                notifs = lsGet(nk(LS_NOTIFS), []);
                                                                readSet = new Set(lsGet(nk(LS_NREAD), []));
                                                                lastTs = Number(lsGet(nk(LS_NLAST), 0)) || 0;
                                                            }
                                                            function saveState() {
                                                                lsSet(nk(LS_NOTIFS), notifs.slice(0, 80));
                                                                lsSet(nk(LS_NREAD), Array.from(readSet).slice(-300));
                                                                lsSet(nk(LS_NLAST), lastTs);
                                                            }
                                                            function unread() {
                                                                return notifs.filter(function (n) { return !readSet.has(n.id); }).length;
                                                            }
                                                            function ago(ts) {
                                                                var s = Math.max(1, Math.round((Date.now() - ts) / 1000));
                                                                if (s < 60) return "now";
                                                                var m = Math.round(s / 60);
                                                                if (m < 60) return m + "m";
                                                                var h = Math.round(m / 60);
                                                                return h < 24 ? h + "h" : Math.round(h / 24) + "d";
                                                            }
                                                            
                                                            var NT_ICONS = {
                                                                bell:     '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>',
                                                                checkAll: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L7 17l-5-5"/><path d="M22 10l-7.5 7.5L13 16"/></svg>',
                                                                gear:     '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
                                                                close:    '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
                                                                heart:    '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>',
                                                                star:     '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
                                                                fire:     '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 2c.5 3.5-1.5 5.5-1.5 5.5S13 6.5 14 4c3 2.5 5 6 5 10a7 7 0 1 1-14 0c0-3.5 2.5-7 7-12z"/></svg>',
                                                                trophy:   '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2z"/></svg>',
                                                                calendar: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
                                                                brush:    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/></svg>',
                                                                chat:     '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>'
                                                            };
                                                            
                                                            function notifKindBadge(n) {
                                                                var type = String((n && n.type) || "").toLowerCase();
                                                                var text = String((n && (n.title || n.body || n.text)) || "").toLowerCase();
                                                                if (text.indexOf("heart") >= 0 || text.indexOf("❤️") >= 0) return { cls: "nt-ico-heart", svg: NT_ICONS.heart };
                                                                if (text.indexOf("star") >= 0 || text.indexOf("⭐") >= 0)  return { cls: "nt-ico-star",  svg: NT_ICONS.star };
                                                                if (text.indexOf("fire") >= 0 || text.indexOf("🔥") >= 0)  return { cls: "nt-ico-fire",  svg: NT_ICONS.fire };
                                                                if (type === "react")                                      return { cls: "nt-ico-chat",  svg: NT_ICONS.chat };
                                                                if (type === "milestone" || text.indexOf("milestone") >= 0) return { cls: "nt-ico-mile", svg: NT_ICONS.trophy };
                                                                if (type === "hostart" || text.indexOf("art") >= 0)        return { cls: "nt-ico-art",   svg: NT_ICONS.brush };
                                                                if (type === "reveal" || type === "ended" || type === "soon" || type === "joined" || text.indexOf("event") >= 0) {
                                                                    return { cls: "nt-ico-ev", svg: NT_ICONS.calendar };
                                                                }
                                                                return { cls: "nt-ico-def", svg: NT_ICONS.bell };
                                                            }
                                                            
                                                            function renderBadge() {
                                                                var n = unread(), b = $("notif-badge");
                                                                if (b) { b.hidden = n === 0; b.textContent = n > 99 ? "99+" : String(n); }
                                                                var pill = $("notif-unread-pill");
                                                                if (pill) { pill.hidden = n === 0; pill.textContent = String(n); }
                                                                var readAll = $("notif-readall");
                                                                if (readAll) readAll.disabled = n === 0;
                                                            }
                                                            
                                                            function renderList() {
                                                                var list = $("notif-list");
                                                                if (!list) return;
                                                                renderBadge();
                                                                list.replaceChildren();
                                                                
                                                                if (!notifs.length) {
                                                                    var empty = mk("div", "nt-empty");
                                                                    var ico = mk("div", "nt-empty-ico");
                                                                    ico.innerHTML = NT_ICONS.bell;
                                                                    empty.append(
                                                                        ico,
                                                                        mk("strong", "", "You’re all caught up"),
                                                                        mk("small", "", "Reactions, milestones, and event updates will appear here.")
                                                                    );
                                                                    list.appendChild(empty);
                                                                    return;
                                                                }
                                                                
                                                                notifs.forEach(function (n) {
                                                                    var isRead = readSet.has(n.id);
                                                                    var badge = notifKindBadge(n);
                                                                    var row = mk("button", "nt-row" + (isRead ? "" : " unread"));
                                                                    row.type = "button";
                                                                    
                                                                    var icoWrap = mk("span", "nt-ico " + badge.cls);
                                                                    icoWrap.innerHTML = badge.svg;
                                                                    
                                                                    var main = mk("span", "nt-main");
                                                                    main.append(
                                                                        mk("span", "nt-title", n.title || ""),
                                                                        mk("span", "nt-body", n.body || "")
                                                                    );
                                                                    
                                                                    var right = mk("span", "nt-right");
                                                                    right.append(mk("span", "nt-time", ago(n.ts)));
                                                                    if (!isRead) right.append(mk("span", "nt-dot"));
                                                                    
                                                                    row.append(icoWrap, main, right);
                                                                    row.onclick = function () { openNotif(n); };
                                                                    list.appendChild(row);
                                                                });
                                                            }
                                                            
                                                            function osNotify(n) {
                                                                try {
                                                                    if (hasPush() && window.AndroidPush.showLocal) {
                                                                        window.AndroidPush.showLocal(n.title || "ARTcher", n.body || "", JSON.stringify(n));
                                                                        return;
                                                                    }
                                                                    if (document.hidden && "Notification" in window && Notification.permission === "granted") {
                                                                        new Notification(n.title || "ARTcher", { body: n.body || "" });
                                                                    }
                                                                } catch (e) {}
                                                            }
                                                            
                                                            function announce(n) {
                                                                showToast(n.title || "New notification");
                                                                haptic([14, 40, 14]);
                                                                var bell = $("notif-bell");
                                                                if (bell) { bell.classList.remove("ring"); void bell.offsetWidth; bell.classList.add("ring"); }
                                                                osNotify(n);
                                                            }
                                                            
                                                            function ingest(items, live, silent) {
                                                                var fresh = [];
                                                                items.forEach(function (n) {
                                                                    if (!n || !n.id || notifs.some(function (x) { return x.id === n.id; })) return;
                                                                    notifs.push(n);
                                                                    fresh.push(n);
                                                                    if (n.ts > lastTs) lastTs = n.ts;
                                                                });
                                                                if (!fresh.length) return;
                                                                notifs.sort(function (a, b) { return b.ts - a.ts; });
                                                                notifs = notifs.slice(0, 80);
                                                                if (silent) fresh.forEach(function (n) { readSet.add(n.id); });
                                                                saveState();
                                                                renderBadge();
                                                                if ($("notif-modal") && $("notif-modal").classList.contains("open")) renderList();
                                                                if (silent || prefs().on === false) return;
                                                                if (live || fresh.length <= 3) fresh.slice(0, 3).forEach(announce);
                                                                else showToast(fresh.length + " new notifications");
                                                            }
                                                            
                                                            function pull() {
                                                                if (!navigator.onLine) return Promise.resolve();
                                                                var key = userKey(), first = lastTs === 0;
                                                                return gasGet({ module: "fwnotifs", key: key, since: lastTs }).then(function (j) {
                                                                    if (j && j.ok && key === userKey()) ingest(j.items || [], false, first);
                                                                }).catch(function () {});
                                                            }
                                                            
                                                            function fallbackClient() {
                                                                if (window.__fwnClient) return window.__fwnClient;
                                                                if (window.supabase && SUPABASE_URL && SUPABASE_ANON_KEY) {
                                                                    window.__fwnClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
                                                                }
                                                                return window.__fwnClient || null;
                                                            }
                                                            
                                                            function connectLive() {
                                                                var key = userKey();
                                                                if (liveChan && liveKey === key) return;
                                                                var client = window.sbClient || fallbackClient();
                                                                if (!client) return;
                                                                if (liveChan) { try { client.removeChannel(liveChan); } catch (e) {} liveChan = null; }
                                                                liveKey = key;
                                                                try {
                                                                    liveChan = client.channel("fwn:" + key, { config: { broadcast: { self: false } } });
                                                                    liveChan.on("broadcast", { event: "notif" }, function (m) {
                                                                        if (m && m.payload) ingest([m.payload], true);
                                                                    }).subscribe();
                                                                } catch (e) {}
                                                            }
                                                            
                                                            var regTimer = 0;
                                                            function registerDevice() {
                                                                clearTimeout(regTimer);
                                                                regTimer = setTimeout(function () {
                                                                    if (!navigator.onLine) return;
                                                                    var token = "";
                                                                    try { if (hasPush() && window.AndroidPush.getToken) token = window.AndroidPush.getToken() || ""; } catch (e) {}
                                                                    window.gasPost({
                                                                        action: "fwRegisterDevice",
                                                                        key: userKey(),
                                                                        dev: deviceId,
                                                                        token: token,
                                                                        platform: hasPush() ? "android" : "web",
                                                                        prefs: prefs(),
                                                                        name: myName()
                                                                    }).catch(function () {});
                                                                }, 600);
                                                            }
                                                            window.onPushToken = function () { registerDevice(); };
                                                            
                                                            function waitForEntry(id, ms) {
                                                                return new Promise(function (res) {
                                                                    var t0 = Date.now();
                                                                    (function tick() {
                                                                        var e = wallEntries.find(function (x) { return x.id === id; });
                                                                        if (e) return res(e);
                                                                        if (Date.now() - t0 > ms) return res(null);
                                                                        setTimeout(tick, 250);
                                                                    })();
                                                                });
                                                            }
                                                            
                                                            function openNotif(n, fromPush) {
                                                                if (fromPush) ingest([n], false, true);
                                                                readSet.add(n.id);
                                                                saveState();
                                                                renderBadge();
                                                                var modal = $("notif-modal");
                                                                if (modal) modal.classList.remove("open");
                                                                var code = n.event || "", p = Promise.resolve();
                                                                if (code !== evCode()) p = code ? switchScope(code) : switchScope("");
                                                                p.then(function () {
                                                                    switchView("wall");
                                                                    if (!n.entryId) return;
                                                                    return waitForEntry(n.entryId, 7000).then(function (e) {
                                                                        if (!e) { showToast("Couldn't find that drawing. It may be hidden or removed."); return; }
                                                                        focusTile(e);
                                                                        setTimeout(function () { openModal(e); }, 750);
                                                                    });
                                                                });
                                                            }
                                                            
                                                            window.onNativeOpen = function (s) {
                                                                try {
                                                                    var n = typeof s === "string" ? JSON.parse(s) : s;
                                                                    if (n && n.id) openNotif(n, true);
                                                                } catch (e) {}
                                                            };
                                                            
                                                            function checkPendingOpen() {
                                                                try {
                                                                    if (hasPush() && window.AndroidPush.consumePendingOpen) {
                                                                        var s = window.AndroidPush.consumePendingOpen();
                                                                        if (s) window.onNativeOpen(s);
                                                                    }
                                                                } catch (e) {}
                                                            }
                                                            
                                                            function askPermission() {
                                                                try {
                                                                    if (hasPush() && window.AndroidPush.requestPermission) window.AndroidPush.requestPermission();
                                                                    else if ("Notification" in window && Notification.permission === "default") Notification.requestPermission();
                                                                } catch (e) {}
                                                            }
                                                            
                                                            function fetchMine() {
                                                                if (!(userProfile && userProfile.account)) return;
                                                                gasGet({ module: "fwmine", key: userKey() }).then(function (j) {
                                                                    if (j && j.ok && Array.isArray(j.ids)) {
                                                                        myTileIds = Array.from(new Set(myTileIds.concat(j.ids))).slice(-50);
                                                                        lsSet(LS_MINE, myTileIds);
                                                                    }
                                                                }).catch(function () {});
                                                            }
                                                            
                                                            function joinServer(code) {
                                                                var k = code + ":" + userKey(), m = lsGet(LS_JOINED, {}) || {};
                                                                if (m[k]) return;
                                                                m[k] = 1;
                                                                lsSet(LS_JOINED, m);
                                                                window.gasPost({ action: "fwJoinEvent", code: code, key: userKey() }).catch(function () {
                                                                    delete m[k];
                                                                    lsSet(LS_JOINED, m);
                                                                });
                                                            }
                                                            
                                                            function buildNotifUI() {
                                                                var bell = mk("button", "notif-bell");
                                                                bell.id = "notif-bell";
                                                                bell.type = "button";
                                                                bell.setAttribute("aria-label", "Notifications");
                                                                bell.innerHTML = NT_ICONS.bell + '<span class="notif-badge" id="notif-badge" hidden>0</span>';
                                                                
                                                                var cluster = document.querySelector(".topbar > div");
                                                                if (cluster) cluster.insertBefore(bell, $("weather-pill") || cluster.firstChild);
                                                                
                                                                document.body.insertAdjacentHTML("beforeend",
                                                                    '<div class="modal-backdrop" id="notif-modal">' +
                                                                    '<div class="modal-box nt-box" role="dialog" aria-modal="true" aria-labelledby="notif-title">' +
                                                                    '<div class="modal-head">' +
                                                                    '<div class="nt-head-title">' +
                                                                    '<h3 id="notif-title">Notifications</h3>' +
                                                                    '<span class="nt-unread-pill" id="notif-unread-pill" hidden>0</span>' +
                                                                    '</div>' +
                                                                    '<div class="nt-head-actions">' +
                                                                    '<button type="button" class="btn btn-sm nt-ico-btn" id="notif-readall" title="Mark all as read" aria-label="Mark all as read">' +
                                                                    NT_ICONS.checkAll + '<span>Read all</span>' +
                                                                    '</button>' +
                                                                    '<button type="button" class="btn btn-sm nt-icon-only" id="notif-settings" title="Notification settings" aria-label="Notification settings">' +
                                                                    NT_ICONS.gear +
                                                                    '</button>' +
                                                                    '<button type="button" class="btn btn-sm nt-icon-only" id="notif-close" title="Close" aria-label="Close">' +
                                                                    NT_ICONS.close +
                                                                    '</button>' +
                                                                    '</div>' +
                                                                    '</div>' +
                                                                    '<div class="nt-list" id="notif-list"></div>' +
                                                                    '</div>' +
                                                                    '</div>'
                                                                );
                                                                
                                                                var modal = $("notif-modal");
                                                                bell.onclick = function () {
                                                                    renderList();
                                                                    modal.classList.add("open");
                                                                    haptic(6);
                                                                    pull();
                                                                };
                                                                modal.onclick = function (e) { if (e.target === modal) modal.classList.remove("open"); };
                                                                $("notif-close").onclick = function () { modal.classList.remove("open"); };
                                                                $("notif-readall").onclick = function () {
                                                                    notifs.forEach(function (n) { readSet.add(n.id); });
                                                                    saveState();
                                                                    renderBadge();
                                                                    renderList();
                                                                    haptic(8);
                                                                };
                                                                $("notif-settings").onclick = function () {
                                                                    modal.classList.remove("open");
                                                                    switchView("more");
                                                                    setTimeout(function () {
                                                                        var c = $("np-card");
                                                                        if (c) c.scrollIntoView({ behavior: "smooth", block: "start" });
                                                                    }, 250);
                                                                };
                                                            }
                                                            
                                                            function buildMoreCards() {
                                                                var acctBtn = $("acct-btn");
                                                                if (acctBtn) {
                                                                    acctBtn.onclick = function () {
                                                                        if (userProfile && userProfile.account) logout();
                                                                        else openAuth("login", true);
                                                                    };
                                                                }
                                                                var opt = $("opt-grid") && $("opt-grid").closest(".card");
                                                                if (!opt) return;
                                                                function sw(id, t, s) {
                                                                    return '<label class="list-row"><span>' + t + '<small>' + s + '</small></span><span class="switch"><input type="checkbox" id="' + id + '"></span></label>';
                                                                }
                                                                var card = mk("div", "card");
                                                                card.id = "np-card";
                                                                card.innerHTML = '<div class="card-head">Notifications</div>' +
                                                                sw("np-on", "Notifications", "Master switch for alerts") +
                                                                sw("np-react", "Reactions on my art", "Hearts, stars and fire") +
                                                                sw("np-host", "New art in events I host", "When someone posts to your event") +
                                                                sw("np-event", "Event updates", "Reveal, ending soon, archived") +
                                                                sw("np-mile", "Milestones", "When a drawing reaches 5, 10, 25 reactions…") +
                                                                sw("np-push", "Push when the app is closed", hasPush() ? "Delivered through Firebase" : "Needs the Android app") +
                                                                '<button type="button" class="list-row" id="np-test"><span class="lead"><svg viewBox="0 0 24 24"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg><span>Send a test notification<small>Checks live and push delivery</small></span></span></button>';
                                                                opt.parentNode.insertBefore(card, opt);
                                                                [["np-on", "on"], ["np-react", "reactions"], ["np-host", "hostArt"], ["np-event", "eventUpdates"], ["np-mile", "milestones"], ["np-push", "push"]].forEach(function (p) {
                                                                    var i = $(p[0]);
                                                                    i.checked = prefs()[p[1]] !== false;
                                                                    i.onchange = function () {
                                                                        var o = prefs();
                                                                        o[p[1]] = i.checked;
                                                                        lsSet(LS_NPREFS, o);
                                                                        registerDevice();
                                                                        if (i.checked && (p[1] === "on" || p[1] === "push")) askPermission();
                                                                    };
                                                                });
                                                                $("np-test").onclick = function () {
                                                                    window.gasPost({ action: "fwTest", key: userKey() }).then(function (j) {
                                                                        showToast(j && j.ok ? "Test sent. It should arrive in a second." : ((j && j.error) || "Test failed."));
                                                                    }).catch(function () { showToast("Couldn't reach the server."); });
                                                                };
                                                            }
                                                            
                                                            /* =====================================================================
                                                            3. MAIN <-> EVENT QUICK SWITCH
                                                            ===================================================================== */
                                                            function libList() { var a = lsGet(LS_LIB, []); return Array.isArray(a) ? a : []; }
                                                            function ended(e) { return e.status !== "active" || Date.now() >= (e.endTs || 0); }
                                                            function switchScope(code) {
                                                                closeScopePop();
                                                                if (!code) { if (curEvent) { setScope(null); showToast("Main wall"); } return Promise.resolve(); }
                                                                if (curEvent && curEvent.code === code) return Promise.resolve();
                                                                return joinEventByCode(code).then(function (ok) {
                                                                    if (!ok) { var rec = libList().find(function (e) { return e.code === code; }); if (rec) setScope(rec); }
                                                                });
                                                            }
                                                            window.switchScope = switchScope;
                                                            function updateScopeUI() {
                                                                var b = $("scope-switch");
                                                                if (b) b.textContent = curEvent ? "🎪 " + curEvent.name.slice(0, 12) + " ▾" : "🏠 Main ▾";
                                                                renderPostScope();
                                                            }
                                                            function renderPostScope() {
                                                                var seg = $("post-scope"); if (!seg) return;
                                                                seg.replaceChildren();
                                                                function add(label, code, on) { var b = mk("button", "ps-btn" + (on ? " on" : ""), label); b.type = "button"; b.onclick = function () { switchScope(code); }; seg.appendChild(b); }
                                                                add("🏠 Main wall", "", !curEvent);
                                                                var live = libList().filter(function (e) { return !ended(e); });
                                                                if (curEvent && !live.some(function (e) { return e.code === curEvent.code; })) live.unshift(curEvent);
                                                                live.slice(0, 3).forEach(function (e) { add("🎪 " + (e.name || e.code).slice(0, 16), e.code, !!curEvent && curEvent.code === e.code); });
                                                            }
                                                            var scopePop = null;
                                                            function closeScopePop() { if (scopePop) { scopePop.remove(); scopePop = null; } }
                                                            function toggleScopePop() {
                                                                if (scopePop) return closeScopePop();
                                                                var btn = $("scope-switch"), r = btn.getBoundingClientRect();
                                                                scopePop = mk("div", "scope-pop");
                                                                scopePop.style.left = Math.max(8, Math.min(r.left, window.innerWidth - 308)) + "px";
                                                                scopePop.style.top = (r.bottom + 6) + "px";
                                                                function row(label, code, on, meta) {
                                                                    var b = mk("button", "sp-row" + (on ? " on" : ""), label); b.type = "button";
                                                                    if (meta) b.appendChild(mk("small", "", meta));
                                                                    b.onclick = function () { haptic(8); switchScope(code); }; scopePop.appendChild(b);
                                                                }
                                                                scopePop.appendChild(mk("div", "sp-h", "Wall"));
                                                                row("🏠 Main wall", "", !curEvent, "");
                                                                var lib = libList(), live = lib.filter(function (e) { return !ended(e); }), done = lib.filter(ended);
                                                                if (curEvent && !lib.some(function (e) { return e.code === curEvent.code; })) live.unshift(curEvent);
                                                                if (live.length) { scopePop.appendChild(mk("div", "sp-h", "Live events")); live.forEach(function (e) { row("🎪 " + e.name, e.code, !!curEvent && curEvent.code === e.code, fmtLeft((e.endTs || 0) - Date.now())); }); }
                                                                if (done.length) { scopePop.appendChild(mk("div", "sp-h", "Archive")); done.slice(0, 6).forEach(function (e) { row("📦 " + e.name, e.code, !!curEvent && curEvent.code === e.code, e.code); }); }
                                                                var j = mk("button", "sp-row", "➕ Join with a code…"); j.type = "button"; j.onclick = function () { closeScopePop(); openEventModal(); }; scopePop.appendChild(j);
                                                                document.body.appendChild(scopePop);
                                                            }
                                                            document.addEventListener("pointerdown", function (e) { if (scopePop && !e.target.closest(".scope-pop, #scope-switch")) closeScopePop(); });
                                                            
                                                            function buildScopeUI() {
                                                                var hud = document.querySelector("#view-wall .wall-hud"), evb = $("event-btn");
                                                                if (hud) {
                                                                    var sw = mk("button", "btn btn-secondary"); sw.id = "scope-switch"; sw.type = "button"; sw.onclick = toggleScopePop;
                                                                    hud.insertBefore(sw, evb || null);
                                                                }
                                                                var note = $("event-post-note");
                                                                if (note) { var seg = mk("div", "post-scope"); seg.id = "post-scope"; note.after(seg); }
                                                                var acts = document.querySelector("#event-current .modal-actions");
                                                                if (acts) {
                                                                    var m = mk("button", "btn btn-sm", "Main wall"); m.type = "button";
                                                                    m.onclick = function () { closeEventModal(); switchScope(""); };
                                                                    acts.appendChild(m);
                                                                }
                                                                wrap("setScope", function (o) { return function (ev) {
                                                                    var r = o.apply(this, arguments);
                                                                    try { if (ev && ev.code && ev.status !== "archived") joinServer(ev.code); } catch (e) {}
                                                                    updateScopeUI(); return r;
                                                                }; });
                                                                wrap("applyEventUI", function (o) { return function () { var r = o.apply(this, arguments); try { updateScopeUI(); } catch (e) {} return r; }; });
                                                                updateScopeUI();
                                                            }
                                                            
                                                            /* =====================================================================
                                                            4. SHAPE ROTATION (any angle, 0-360)
                                                            ===================================================================== */
                                                            function rotPt(x, y, cx, cy, deg) {
                                                                var a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), dx = x - cx, dy = y - cy;
                                                                return [cx + dx * c - dy * s, cy + dx * s + dy * c];
                                                            }
                                                            window.shapeToStroke = shapeToStroke;
                                                            window.pickShapeAt = pickShapeAt;
                                                            window.selectShape = selectShape;
                                                            window.updateShapeOverlay = function () {
                                                                if (!shapeEd) return;
                                                                shapeEd.style.setProperty("--zs", String(studioScale || 1));
                                                                var lyr = selectedShape();
                                                                if (!lyr || !lyr.visible || previewHidden || isPreviewing) { shapeEd.hidden = true; syncRotUI(); return; }
                                                                var s = lyr.shape, b = shapeBounds(s), isLine = s.kind === "line", rot = isLine ? 0 : (s.r || 0);
                                                                var cx = (b.L + b.R) / 2, cy = (b.T + b.B) / 2, w = b.R - b.L, h = b.B - b.T;
                                                                var pct = function (v) { return (v / 5) + "%"; };
                                                                var put = function (el, x, y) { el.style.left = pct(clamp(x, 6, 494)); el.style.top = pct(clamp(y, 6, 494)); };
                                                                var putR = function (el, x, y) { var q = rotPt(x, y, cx, cy, rot); put(el, q[0], q[1]); };
                                                                shapeEd.hidden = false;
                                                                Object.assign(shapeEd.box.style, { left: pct(b.L), top: pct(b.T), width: pct(w), height: pct(h), transformOrigin: "50% 50%", transform: rot ? "rotate(" + rot + "deg)" : "" });
                                                                SHAPE_RESIZE_HANDLES.forEach(function (k) {
                                                                    var el = shapeEd.handles[k]; el.hidden = isLine;
                                                                    if (!isLine) putR(el, b.L + SHAPE_HANDLE_POS[k][0] * w, b.T + SHAPE_HANDLE_POS[k][1] * h);
                                                                });
                                                                shapeEd.handles.p0.hidden = !isLine; shapeEd.handles.p1.hidden = !isLine;
                                                                if (isLine) { put(shapeEd.handles.p0, s.x0, s.y0); put(shapeEd.handles.p1, s.x1, s.y1); }
                                                                var small = w < 70 || h < 70;
                                                                if (small) putR(shapeEd.handles.move, cx, b.B + 18); else put(shapeEd.handles.move, cx, cy);
                                                                var rh = shapeEd.handles.rot;
                                                                if (rh) { rh.hidden = isLine; if (!isLine) putR(rh, cx, b.T < 44 ? b.B + (small ? 42 : 34) : b.T - 30); }
                                                                syncRotUI();
                                                            };
                                                            window.applyShapeDrag = applyShapeDrag;
                                                            function syncRotUI() {
                                                                var l = selectedShape(), show = !!l && l.shape.kind !== "line";
                                                                var row = $("shape-rot-row"), q = $("shape-rot-quick"); if (row) row.hidden = !show; if (q) q.hidden = !show;
                                                                if (show) { var r = Math.round(l.shape.r || 0) % 360; $("shape-rot-slider").value = r; $("shape-rot-val").textContent = r + "°"; }
                                                            }
                                                            function setRot(deg) {
                                                                var l = selectedShape(); if (!l || l.shape.kind === "line") return;
                                                                l.shape.r = ((Math.round(deg) % 360) + 360) % 360;
                                                                commitShapeEdit(l); syncRotUI();
                                                            }
                                                            function buildShapeRotation() {
                                                                wrap("beginShapeDrag", function (o) { return function (e, key) { o.apply(this, arguments); if (shapeDrag) shapeDrag.r0 = shapeDrag.lyr.shape.r || 0; }; });
                                                                if (shapeEd && !shapeEd.handles.rot) {
                                                                    var h = mk("button", "shape-h h-rot", "↻"); h.type = "button"; h.setAttribute("aria-label", "Rotate shape");
                                                                    h.addEventListener("pointerdown", function (e) { window.beginShapeDrag(e, "rot"); });
                                                                    h.addEventListener("touchstart", function (e) { e.stopPropagation(); }, { passive: true });
                                                                    shapeEd.appendChild(h); shapeEd.handles.rot = h;
                                                                }
                                                                var anchor = $("shape-sel-row");
                                                                if (anchor) {
                                                                    var row = mk("div", "slider-row"); row.id = "shape-rot-row"; row.hidden = true;
                                                                    row.innerHTML = '<span>Rotate</span><input type="range" id="shape-rot-slider" min="0" max="360" step="1" value="0"><span class="slider-val" id="shape-rot-val">0°</span>';
                                                                    var quick = mk("div", "rot-quick"); quick.id = "shape-rot-quick"; quick.hidden = true;
                                                                    [["−15°", -15], ["+15°", 15], ["90°", 90], ["Reset", 0]].forEach(function (p) {
                                                                        var b = mk("button", "btn btn-sm", p[0]); b.type = "button";
                                                                        b.onclick = function () { var l = selectedShape(); if (!l) return; setRot(p[0] === "Reset" ? 0 : p[0] === "90°" ? (l.shape.r || 0) + 90 : (l.shape.r || 0) + p[1]); };
                                                                        quick.appendChild(b);
                                                                    });
                                                                    anchor.after(row); row.after(quick);
                                                                    $("shape-rot-slider").oninput = function () { setRot(Number(this.value)); };
                                                                }
                                                                syncRotUI();
                                                            }
                                                            
                                                            /* =====================================================================
                                                            BOOT
                                                            ===================================================================== */
                                                            function onKeyChanged() {
                                                                loadState(); renderBadge(); connectLive(); pull(); registerDevice(); fetchMine(); renderAccountCard(); renderPostScope();
                                                            }
                                                            function boot() {
                                                                buildAuth(); buildNotifUI(); buildMoreCards(); buildScopeUI(); buildShapeRotation();
                                                                if (!userProfile && !focusLinkRequested) { var old = $("nickname-overlay"); if (old) old.hidden = true; openAuth("login", false); }
                                                                onKeyChanged();
                                                                setInterval(function () { if (!document.hidden) pull(); }, 45000);
                                                                document.addEventListener("visibilitychange", function () { if (!document.hidden) { pull(); checkPendingOpen(); } });
                                                                window.addEventListener("online", function () { pull(); registerDevice(); });
                                                                checkPendingOpen();
                                                                window.setTimeout(function () { window.maybePromptTutorial(); }, 1500);
                                                            }
                                                            boot();
                                                        })();
                                                        
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
                                                    
                                                            var lastView = lsGet(LS_LAST_VIEW, "home");
                                                            var hasCollabInvite = new URLSearchParams(window.location.hash.replace(/^#/, "")).has("collab");
                                                            if (!hasCollabInvite && (lastView === "draw" || lastView === "wall")) window.switchView(lastView);