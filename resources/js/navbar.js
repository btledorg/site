(function () {
  "use strict";
  
  // --- 1. DYNAMICALLY INJECT REMIX ICONS ---
  function loadRemixIcons() {
    if (!document.querySelector('link[href*="remixicon.css"]')) {
      var link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "https://cdn.jsdelivr.net/npm/remixicon@4.2.0/fonts/remixicon.css";
      document.head.appendChild(link);
    }
  }
  loadRemixIcons();
  
  // --- 2. DARK MODE INITIALIZATION ---
  function initSystemDarkMode() {
    if (document.getElementById("btled-dark-mode-styles")) return;
    
    var style = document.createElement("style");
    style.id = "btled-dark-mode-styles";
    style.innerHTML = `
      html, body, .panel, .cert-card, .table-section, .desc-card, .summary-card, .profile-header, .edit-card, .edit-photo-section {
        transition: background-color 0.3s ease, color 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease;
      }
      html[data-theme="dark"] {
        --btled-bg: #121212 !important;
        --btled-dark: #f9fafb !important;
        --bg-page: #121212 !important;
        --bg-subtle: #1e1e1e !important;
        --text-main: #f9fafb !important;
        --text-muted: #9ca3af !important;
        --border-dark: #374151 !important;
        --border-light: #1f2937 !important;
        --accent-blue: #60a5fa !important;
        color-scheme: dark;
      }
      html[data-theme="dark"] .dropdown-menu {
        background-color: #1e1e1e !important;
        box-shadow: 0 8px 16px rgba(0,0,0,0.5) !important;
        border-color: #374151 !important;
      }
      html[data-theme="dark"] .panel, html[data-theme="dark"] .edit-card, html[data-theme="dark"] .cert-card {
        background-color: #1e1e1e !important;
        border-color: #374151 !important;
        color: #f9fafb !important;
      }
      html[data-theme="dark"] .edit-photo-section {
        background-color: #252526 !important;
        border-color: #374151 !important;
      }
      html[data-theme="dark"] input:not([type="submit"]):not([type="button"]), 
      html[data-theme="dark"] select {
        background-color: #121212 !important;
        color: #f9fafb !important;
        border-color: #374151 !important;
      }
      html[data-theme="dark"] .navbar,
      html[data-theme="dark"] header.navbar {
        background-color: #1e1e1e !important;
        border-bottom: 1px solid #374151 !important;
        color: #f9fafb !important;
      }
      html[data-theme="dark"] .navbar a,
      html[data-theme="dark"] .navbar span,
      html[data-theme="dark"] .navbar button {
        color: #f9fafb !important;
      }
    `;
    document.head.appendChild(style);
    
    var savedTheme = localStorage.getItem("btled_theme");
    var systemDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    
    if (savedTheme === "dark" || (!savedTheme && systemDark)) {
      document.documentElement.setAttribute("data-theme", "dark");
    } else {
      document.documentElement.setAttribute("data-theme", "light");
    }
  }
  initSystemDarkMode();

  // --- 2.5 NAVBAR PROFILE & ALIGNMENT CSS ---
  function initNavbarStyles() {
    if (document.getElementById("btled-navbar-styles")) return;
    var style = document.createElement("style");
    style.id = "btled-navbar-styles";
    style.innerHTML = `
      .nav-profile-pic {
        width: 32px;
        height: 32px;
        border-radius: 10%;
        object-fit: cover;
        vertical-align: middle;
        border: 2px solid var(--border-light);
        background-color: #fff;
      }
      .profile-trigger {
        display: flex !important;
        align-items: center;
        gap: 12px;
      }
      .nav-profile-name {
        flex-grow: 1;
        text-align: left;
        font-weight: 500;
        text-transform: capitalize;
      }
      .theme-text {
        display: inline-block;
      }
      
      /* Desktop Layout: Theme text hidden, Profile Far Right */
      @media (min-width: 851px) {
        .nav-profile-name {
          display: none;
        }
        .theme-text {
          display: none; 
        }
        #theme-toggle i {
          margin-left: 0 !important;
          font-size: 1.35rem !important;
        }
        .nav-menu {
          display: flex;
          align-items: center;
        }
      }
      
      /* Mobile Layout: Alignments and Arrows */
      @media (max-width: 850px) {
        .nav-profile-name {
          display: inline-block;
        }
        .profile-trigger .nav-arrow, .nav-menu .dropdown > a .nav-arrow {
          margin-left: auto; /* Pushes arrow completely to the right on mobile */
        }
        .nav-menu .dropdown > a {
          display: flex;
          align-items: center;
        }
      }
      
      /* --- THEME TOGGLE ANIMATIONS --- */
      #theme-toggle i {
        display: inline-block;
        transition: transform 0.5s cubic-bezier(0.4, 0, 0.2, 1);
      }
      
      /* Sun hover: 180deg rotation looks perfectly natural for a sun */
      html[data-theme="dark"] #theme-toggle:hover i {
        transform: rotate(180deg);
      }
      
      /* Moon hover: Full 360deg rotation so it doesn't end up looking like an awkward cup */
      html[data-theme="light"] #theme-toggle:hover i,
      html:not([data-theme="dark"]) #theme-toggle:hover i {
        transform: rotate(-360deg); 
      }
      
      /* Animation class for the -180deg to 0 switch */
      @keyframes icon-swap {
        0% { transform: rotate(-180deg) scale(0.5); opacity: 0.5; }
        100% { transform: rotate(0deg) scale(1); opacity: 1; }
      }
      .theme-icon-animate {
        animation: icon-swap 0.4s cubic-bezier(0.4, 0, 0.2, 1) forwards !important;
      }
    `;
    document.head.appendChild(style);
  }
  initNavbarStyles();
  
  // --- 3. SAME-TAB LOCALSTORAGE OBSERVER ---
  var originalSetItem = localStorage.setItem;
  localStorage.setItem = function (key, value) {
    originalSetItem.apply(this, arguments);
    if (key.startsWith("btled_")) {
      window.dispatchEvent(new CustomEvent("local-storage-changed", { detail: { key: key } }));
    }
  };
  
  var originalRemoveItem = localStorage.removeItem;
  localStorage.removeItem = function (key) {
    originalRemoveItem.apply(this, arguments);
    if (key.startsWith("btled_")) {
      window.dispatchEvent(new CustomEvent("local-storage-changed", { detail: { key: key } }));
    }
  };
  
  function normalizeRoot(root) {
    if (!root) return "./";
    var cleaned = String(root).replace(/\/{2,}/g, "/");
    if (!/\/$/.test(cleaned)) cleaned += "/";
    return cleaned;
  }
  
  function joinPath(root, path) {
    return normalizeRoot(root) + String(path || "").replace(/^\/+/, "");
  }
  
  function smartLink(ROOT, targetPath) {
    var fullUrl = joinPath(ROOT, targetPath);
    var parts = targetPath.split("#");
    var targetFile = parts[0];
    var targetHash = parts[1] ? "#" + parts[1] : "";
    if (!targetFile || targetFile === "") return targetHash || fullUrl;
    
    var currentPath = window.location.pathname;
    var isSamePage = currentPath.endsWith(targetFile) || (targetFile === "index.html" && (currentPath.endsWith("/") || currentPath === ""));
    return isSamePage && targetHash ? targetHash : fullUrl;
  }

  // --- Helper to Capitalize Names (Title Case) ---
  function toTitleCase(str) {
    if (!str) return "";
    return str.toLowerCase().split(' ').map(function(word) {
      return word.charAt(0).toUpperCase() + word.slice(1);
    }).join(' ');
  }
    
  // --- 4. RENDER NAVBAR ---
  function renderNavbar() {
    var header = document.getElementById("site-navbar");
    if (!header) return;
    
    var ROOT = normalizeRoot(header.getAttribute("data-root") || "./");
    function link(path) { return joinPath(ROOT, path); }
    function slink(path) { return smartLink(ROOT, path); }
    
    var hasStudentProfile = false;
    var studentName = "Student";
    var studentPhoto = link("resources/image/default-avatar.png");
  
    try {
      var storedStudent = localStorage.getItem("btled_student");
      if (storedStudent) {
        hasStudentProfile = true;
        var parsedStudent = JSON.parse(storedStudent);
        
        // 1. Get Name
        var fName = parsedStudent["First Name"] || parsedStudent.firstName || parsedStudent.name || "";
        var lName = parsedStudent.Surname || parsedStudent.surname || "";
        var studentId = parsedStudent["Student No."] || parsedStudent.id || "";
        
        if (fName || lName) {
           var fullNameRaw = (fName + " " + lName).trim();
           studentName = toTitleCase(fullNameRaw);
        }
  
        // 2. Fetch Photo Logic (Base64 vs Initial)
        var photoKey = "btled_photo_" + studentId;
        var base64Photo = localStorage.getItem(photoKey);
        
        if (base64Photo && base64Photo.trim() !== "") {
            // Use stored base64 image
            studentPhoto = base64Photo;
        } else {
            // Fallback: Generate Initial Avatar based on First Name
            var initial = fName ? fName.charAt(0).toUpperCase() : "S";
            studentPhoto = "https://ui-avatars.com/api/?name=" + initial + "&background=0D8ABC&color=fff&&bold=true";
        }
      }
    } catch (e) {}
    
    var hasUnreadNotifs = false;
    try {
      var notifs = JSON.parse(localStorage.getItem("btled_notifications"));
      hasUnreadNotifs = notifs && notifs.some(function (n) { return !n.read; });
    } catch (e) {}
    var notifBadge = hasUnreadNotifs ? '<span class="badge-dot" title="Unread notifications"></span>' : "";
    
    var profileNav = hasStudentProfile
    ? '<div class="dropdown">' +
      '<a href="' + link("profile/index.html") + '" class="nav-link profile-trigger">' +
      '<img src="' + studentPhoto + '" alt="Profile" class="nav-profile-pic" />' +
      '<span class="nav-profile-name">' + studentName + '</span>' +
      notifBadge +
      ' <i class="ri-arrow-down-s-line nav-arrow"></i></a>' +
      '<ul class="dropdown-menu">' +
      '<li><a href="' + link("profile/edit.html") + '"><i class="ri-edit-box-line"></i> Edit Profile</a></li>' +
      '<li style=" border-bottom: 1px solid var(--border-light); margin: 4px 0;"></li>' +
      '<li><a href="' + link("profile/index.html") + '"><i class="ri-profile-line"></i> View Profile</a></li>' +
      '<li><a href="#" id="logout-link"><i class="ri-logout-box-r-line"></i> Logout</a></li>' +
      "</ul>" +
      "</div>"
    : '<a href="' + link("profile/index.html") + '" class="nav-link">Login</a>';
    
    var isDark = document.documentElement.getAttribute("data-theme") === "dark";
    var themeIcon = isDark ? "ri-sun-line" : "ri-moon-line";
    
    header.innerHTML =
    '<div class="container nav-container">' +
    '<a href="' + link("index.html") + '" class="brand">' +
    '<img src="' + link("resources/image/logo/2.png") + '" alt="BTLED LOGO" class="brand-logo" />' +
    '<div class="brand-text">' +
    '<span class="brand-title">BTLED ORGANIZATION</span>' +
    '<span class="brand-sub">Industrial Arts</span>' +
    "</div>" +
    "</a>" +
    '<button class="menu-toggle" aria-label="Toggle Navigation">' +
    '<span class="hamburger"></span>' +
    "</button>" +
    '<nav class="nav-menu">' +
    
    // About Us
    '<div class="dropdown">' +
    '<a href="' + link("about/index.html") + '" class="nav-link">About Us <i class="ri-arrow-down-s-line nav-arrow"></i></a>' +
    '<ul class="dropdown-menu">' +
    '<li><a href="' + slink("about/index.html#history-constitution") + '"><i class="ri-article-line"></i> History &amp; Constitution</a></li>' +
    '<li><a href="' + slink("about/index.html#spotlight") + '"><i class="ri-focus-3-line"></i> Vision &amp; Mission</a></li>' +
    '<li><a href="' + link("about/logo.html") + '"><i class="ri-image-line"></i> BTLED LOGO</a></li>' +
    '<li><a href="' + slink("about/index.html#officers") + '"><i class="ri-team-line"></i> Executive Officers</a></li>' +
    '<li style="border-bottom: 1px solid var(--border-light); margin: 4px 0;"></li>' +
    '<li><a href="' + link("about/documents.html#achievements") + '"><i class="ri-trophy-line"></i> Achievements &amp; Awards</a></li>' +
    '<li><a href="' + link("about/documents.html#permits") + '"><i class="ri-file-paper-2-line"></i> Permits &amp; Certifications</a></li>' +
    "</ul>" +
    "</div>" +
    
    // Finance
    '<a href="' + link("finance/budget.html") + '" class="nav-link">Finance</a>' +
    
    // Events
    '<div class="dropdown">' +
    '<a href="' + link("events/event.html") + '" class="nav-link">Events <i class="ri-arrow-down-s-line nav-arrow"></i></a>' +
    '<ul class="dropdown-menu">' +
    '<li><a href="' + link("events/event.html") + '"><i class="ri-calendar-event-line"></i> Calendar</a></li>' +
    '<li><a href="' + link("events/forms.html") + '"><i class="ri-file-list-3-line"></i> Forms</a></li>' +
    '<li><a href="' + link("events/validate.html") + '"><i class="ri-checkbox-circle-line"></i> Check Status</a></li>' +
    '<li style="border-bottom: 1px solid var(--border-light); margin: 4px 0;"></li>' +
    '<li><a href="' + link("events/gallery.html") + '"><i class="ri-gallery-line"></i> Event Gallery</a></li>' +
    '<li><a href="' + link("events/result.html") + '"><i class="ri-award-line"></i> Competition Results</a></li>' +
    '<li style="border-bottom: 1px solid var(--border-light); margin: 4px 0;"></li>' +
    '<li><a href="' + link("events/gallery.html?page=Viewer&FolderID=1fsj9LVTFptG3KDaQt9RF5_WSlVIoG2P_&Name=BTLED%20MAINTENANCE%20MONITORING") + '"><i class="ri-shield-check-line"></i> Hallway Monitoring</a></li>' +
    "</ul>" +
    "</div>" +
    
    // Community
    '<div class="dropdown">' +
    '<a href="#" class="nav-link">Community <i class="ri-arrow-down-s-line nav-arrow"></i></a>' +
    '<ul class="dropdown-menu">' +
    '<li><a href="' + link("community/celebrants.html") + '"><i class="ri-cake-2-line"></i> BTLED Celebrates</a></li>' +
    '<li><a href="' + link("community/star.html") + '"><i class="ri-star-smile-line"></i> BTLED Shining Star</a></li>' +
    '<li style="border-bottom: 1px solid var(--border-light); margin: 4px 0;"></li>' +
    '<li><a href="' + link("community/store.html") + '"><i class="ri-store-2-line"></i> BTLED Store</a></li>' +
    '<li><a href="' + link("community/forum.html") + '"><i class="ri-discuss-line"></i> Student Forum</a></li>' +
    "</ul>" +
    "</div>" +
  
    // Contact Us
    '<div class="dropdown">' +
    '<a href="#" class="nav-link">Contact Us <i class="ri-arrow-down-s-line nav-arrow"></i></a>' +
    '<ul class="dropdown-menu">' +
    '<li><a href="mailto:urscbtledorg@gmail.com"><i class="ri-mail-send-line"></i> Email</a></li>' +
    '<li><a href="tel:+639700337672"><i class="ri-phone-line"></i> Phone</a></li>' +
    '<li style="border-bottom: 1px solid var(--border-light); margin: 4px 0;"></li>' +
    '<li><a href="https://btledorganization.tawk.help" target="_blank"><i class="ri-customer-service-2-line"></i> Help Center</a></li>' +
    '<li style="border-bottom: 1px solid var(--border-light); margin: 4px 0;"></li>' +
    '<li><a href="https://www.facebook.com/share/1H2gZ3VW9P/" target="_blank"><i class="ri-facebook-circle-line"></i> Facebook</a></li>' +
    "</ul>" +
    "</div>" +
    
    // Theme Toggle (Icon only on desktop)
    '<div class="dropdown">' +
    '<a href="#" id="theme-toggle" class="nav-link" aria-label="Toggle Dark Mode">' +
    '<span class="theme-text">Theme </span>' +
    '<i class="' + themeIcon + '" style="margin-left:6px; vertical-align:middle;"></i>' +
    "</a>" +
    "</div>" +

    // Profile (Far Right)
    profileNav +

    "</nav>" +
    "</div>";
    
    var toggleBtn = header.querySelector(".menu-toggle");
    var navMenu = header.querySelector(".nav-menu");
    var dropdowns = header.querySelectorAll(".dropdown");
    var logoutLink = header.querySelector("#logout-link");
    var themeToggleBtn = header.querySelector("#theme-toggle");
    
    if (themeToggleBtn) {
      themeToggleBtn.addEventListener("click", function (e) {
        e.preventDefault();
        var current = document.documentElement.getAttribute("data-theme");
        var newTheme = current === "dark" ? "light" : "dark";
        
        document.documentElement.setAttribute("data-theme", newTheme);
        localStorage.setItem("btled_theme", newTheme);
        
        var icon = themeToggleBtn.querySelector("i");
        
        // Reset and trigger the -180deg to 0 animation
        icon.classList.remove("theme-icon-animate");
        void icon.offsetWidth; // Trigger DOM reflow to restart animation
        icon.classList.add("theme-icon-animate");
        
        // Swap the icon
        if (newTheme === "dark") {
          icon.classList.replace("ri-moon-line", "ri-sun-line");
        } else {
          icon.classList.replace("ri-sun-line", "ri-moon-line");
        }
      });
    }
    
    if (toggleBtn && navMenu) {
      toggleBtn.addEventListener("click", function () {
        toggleBtn.classList.toggle("active");
        navMenu.classList.toggle("active");
      });
    }
    
    if (logoutLink) {
      logoutLink.addEventListener("click", async function (e) {
        e.preventDefault();
        const confirmed = await window.showCustomConfirm("Are you sure you want to log out?");
        if (confirmed) {
          localStorage.removeItem("btled_student");
          window.location.href = link("index.html");
        }
      });
    }
    
    dropdowns.forEach(function (dropdown) {
      var navLink = dropdown.querySelector(".nav-link");
      if (navLink) {
        navLink.addEventListener("click", function (e) {
          if (window.innerWidth <= 850) {
            e.preventDefault();
            dropdown.classList.toggle("active");
          }
        });
      }
    });
    
    var currentHref = window.location.href.split("#")[0];
    var navLinks = header.querySelectorAll(".nav-menu a");
    navLinks.forEach(function (linkEl) {
      var rawHref = linkEl.getAttribute("href");
      if (!rawHref || rawHref === "#" || rawHref.startsWith("mailto:") || rawHref.startsWith("tel:")) return;
      var linkBase = linkEl.href ? linkEl.href.split("#")[0] : "";
      if (linkBase && linkBase === currentHref) linkEl.classList.add("active-page");
    });
  }
  
  window.addEventListener("storage", function (e) {
    if (!e.key || e.key.startsWith("btled_")) {
      if (e.key === "btled_theme") initSystemDarkMode();
      renderNavbar();
    }
  });
  
  window.addEventListener("local-storage-changed", function (e) {
    if (!e.detail || e.detail.key.startsWith("btled_")) {
      renderNavbar();
    }
  });
  
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", renderNavbar);
  } else {
    renderNavbar();
  }
})();
  
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("form, input").forEach((el) => {
    el.setAttribute("autocomplete", "off");
  });
});
  
// --- 5. ALERT AND CONFIRMATION MODALS ---
(function () {
  "use strict";
  
  if (!document.getElementById("btled-global-alert-styles")) {
    var alertStyles = document.createElement("style");
    alertStyles.id = "btled-global-alert-styles";
    alertStyles.innerHTML = `
      .custom-alert-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(17, 17, 17, 0.75);
        backdrop-filter: blur(4px);
        display: none;
        align-items: center;
        justify-content: center;
        z-index: 99999;
        padding: 1rem;
      }
      .custom-alert-overlay.active {
        display: flex;
      }
      .custom-alert-card {
        background: var(--bg-subtle, #ffffff);
        padding: 1.75rem;
        border-radius: var(--radius-sm, 4px);
        width: 100%;
        max-width: 360px;
        text-align: center;
        box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.2);
        border: 1px solid var(--border-light, #e2e2dc);
        animation: alertPop 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
      }
      @keyframes alertPop {
        0% { transform: scale(0.9); opacity: 0; }
        100% { transform: scale(1); opacity: 1; }
      }
      .custom-alert-card h3 {
        margin: 0 0 0.5rem 0;
        color: var(--text-main, #111111);
        font-size: 1.2rem;
        font-weight: 900;
        text-transform: uppercase;
        letter-spacing: -0.5px;
      }
      .custom-alert-card p {
        margin: 0 0 1.25rem 0;
        color: var(--text-muted, #666666);
        font-size: 0.95rem;
        line-height: 1.5;
      }
      .custom-alert-btn-group {
        display: flex;
        gap: 0.75rem;
        justify-content: center;
      }
      .custom-alert-btn {
        flex: 1;
        padding: 0.7rem 1rem;
        border-radius: var(--radius-sm, 4px);
        font-weight: 800;
        font-size: 0.85rem;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        cursor: pointer;
        border: none;
        transition: background 0.2s;
      }
      .custom-alert-btn-ok {
        background: var(--accent-blue, #1d4ed8);
        color: #ffffff;
      }
      .custom-alert-btn-ok:hover {
        background: #1e3a8a;
      }
      .custom-alert-btn-cancel {
        background: var(--border-light, #e2e2dc);
        color: var(--text-main, #111111);
      }
      .custom-alert-btn-cancel:hover {
        background: #cbd5e1;
      }
      
      /* Dark Mode Overrides for Alert Modal */
      html[data-theme="dark"] .custom-alert-card {
        background-color: #1e1e1e !important;
        border-color: #374151 !important;
        color: #f9fafb !important;
      }
      html[data-theme="dark"] .custom-alert-card h3 {
        color: #f9fafb !important;
      }
      html[data-theme="dark"] .custom-alert-card p {
        color: #9ca3af !important;
      }
      html[data-theme="dark"] .custom-alert-btn-cancel {
        background: #374151 !important;
        color: #f9fafb !important;
      }
    `;
    document.head.appendChild(alertStyles);
  }
  
  window.showCustomAlert = function(message, options = {}) {
    return new Promise((resolve) => {
      let overlay = document.getElementById("customAlertOverlay");
      if (!overlay) {
        overlay = document.createElement("div");
        overlay.id = "customAlertOverlay";
        overlay.className = "custom-alert-overlay";
        overlay.innerHTML = `
        <div class="custom-alert-card">
          <h3 id="customAlertTitle"></h3>
          <p id="customAlertMessage"></p>
          <div class="custom-alert-btn-group" id="customAlertBtnGroup"></div>
        </div>
      `;
        document.body.appendChild(overlay);
      }
      
      const alertTitle = typeof options === "string" ? options : (options.title || "Attention");
      const titleEl = overlay.querySelector("#customAlertTitle");
      const msgEl = overlay.querySelector("#customAlertMessage");
      const btnGroup = overlay.querySelector("#customAlertBtnGroup");
      
      titleEl.innerText = alertTitle;
      msgEl.innerText = message;
      btnGroup.innerHTML = `<button class="custom-alert-btn custom-alert-btn-ok" id="customAlertOkBtn">OK</button>`;
      
      overlay.classList.add("active");
      
      const okBtn = overlay.querySelector("#customAlertOkBtn");
      let timer = null;
      if (typeof options === "object" && options.duration) {
        timer = setTimeout(() => {
          overlay.classList.remove("active");
          resolve(true);
        }, options.duration);
      }
      
      okBtn.onclick = () => {
        if (timer) clearTimeout(timer);
        overlay.classList.remove("active");
        resolve(true);
      };
    });
  };
  
  window.showCustomConfirm = function(message, title = "Confirmation Required") {
    return new Promise((resolve) => {
      let overlay = document.getElementById("customAlertOverlay");
      if (!overlay) {
        overlay = document.createElement("div");
        overlay.id = "customAlertOverlay";
        overlay.className = "custom-alert-overlay";
        overlay.innerHTML = `
        <div class="custom-alert-card">
          <h3 id="customAlertTitle"></h3>
          <p id="customAlertMessage"></p>
          <div class="custom-alert-btn-group" id="customAlertBtnGroup"></div>
        </div>
      `;
        document.body.appendChild(overlay);
      }
      
      const titleEl = overlay.querySelector("#customAlertTitle");
      const msgEl = overlay.querySelector("#customAlertMessage");
      const btnGroup = overlay.querySelector("#customAlertBtnGroup");
      
      titleEl.innerText = title;
      msgEl.innerText = message;
      btnGroup.innerHTML = `
      <button class="custom-alert-btn custom-alert-btn-cancel" id="customAlertCancelBtn">Cancel</button>
      <button class="custom-alert-btn custom-alert-btn-ok" id="customAlertOkBtn">Confirm</button>
    `;
      
      overlay.classList.add("active");
      
      overlay.querySelector("#customAlertOkBtn").onclick = () => {
        overlay.classList.remove("active");
        resolve(true);
      };
      overlay.querySelector("#customAlertCancelBtn").onclick = () => {
        overlay.classList.remove("active");
        resolve(false);
      };
    });
  };
})();