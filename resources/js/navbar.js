(function () {
  "use strict";

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

    if (!targetFile || targetFile === "") {
      return targetHash || fullUrl;
    }

    var currentPath = window.location.pathname;
    
    var isSamePage = false;
    if (currentPath.endsWith(targetFile) || (targetFile === "index.html" && (currentPath.endsWith("/") || currentPath === ""))) {
      isSamePage = true;
    }

    if (isSamePage && targetHash) {
      return targetHash;
    }

    return fullUrl;
  }

  function renderNavbar() {
    var header = document.getElementById("site-navbar");
    if (!header) return;

    var ROOT = normalizeRoot(header.getAttribute("data-root") || "./");
    function link(path) { return joinPath(ROOT, path); }
    function slink(path) { return smartLink(ROOT, path); }

    var hasStudentProfile = false;
    try {
      hasStudentProfile = !!JSON.parse(localStorage.getItem("btled_student"));
    } catch (e) {
      hasStudentProfile = false;
    }

    // Feature 4 Added: Dynamic Notification Badge Check
    var hasUnreadNotifs = false;
    try {
      var notifs = JSON.parse(localStorage.getItem("btled_notifications"));
      hasUnreadNotifs = notifs && notifs.some(function(n) { return !n.read; });
    } catch (e) {
      hasUnreadNotifs = false;
    }
    var notifBadge = hasUnreadNotifs ? '<span class="badge-dot" title="Unread notifications"></span>' : '';

    var profileNav = hasStudentProfile ?
      '<div class="dropdown">' +
        '<a href="' + link("profile/index.html") + '" class="nav-link">My Profile ' + notifBadge + ' &#9662;</a>' +
        '<ul class="dropdown-menu">' +
          '<li style="display: none;"><a href="' + link("profile/attendance.html") + '">Attendance</a></li>' +
          '<li style="border-bottom: 1px solid var(--border-light); margin: 4px 0;"></li>' +
          '<li><a href="' + link("profile/index.html") + '">View Profile</a></li>' +
          '<li><a href="#" id="logout-link">Logout</a></li>' +
        '</ul>' +
      '</div>' : "";

    header.innerHTML =
      '<div class="container nav-container">' +
        '<a href="' + link("index.html") + '" class="brand">' +
          '<img src="' + link("resources/image/logo/2.png") + '" alt="BTLED LOGO" class="brand-logo" />' +
          '<div class="brand-text">' +
            '<span class="brand-title">BTLED ORGANIZATION</span>' +
            '<span class="brand-sub">Industrial Arts</span>' +
          '</div>' +
        '</a>' +
        '<button class="menu-toggle" aria-label="Toggle Navigation">' +
          '<span class="hamburger"></span>' +
        '</button>' +
        '<nav class="nav-menu">' +
          '<div class="dropdown">' +
            '<a href="' + link("about/index.html") + '" class="nav-link">About Us &#9662;</a>' +
            '<ul class="dropdown-menu">' +
              '<li><a href="' + slink("about/index.html#history-constitution") + '">History &amp; Constitution</a></li>' +
              '<li><a href="' + slink("about/index.html#spotlight") + '">Vision &amp; Mission</a></li>' +
              '<li><a href="' + link("about/logo.html") + '">BTLED LOGO</a></li>' +
              '<li><a href="' + slink("about/index.html#officers") + '">Executive Officers</a></li>' +
              '<li style="border-bottom: 1px solid var(--border-light); margin: 4px 0;"></li>' +
              '<li><a href="' + link("about/documents.html#achievements") + '">Achievements &amp; Awards</a></li>' +
              '<li><a href="' + link("about/documents.html#permits") + '">Permits &amp; Certifications</a></li>' +
            '</ul>' +
          '</div>' +
          '<a href="' + link("finance/budget.html") + '" class="nav-link">Finance</a>' +
          '<div class="dropdown">' +
            '<a href="' + link("events/event.html") + '" class="nav-link">Events &#9662;</a>' +
            '<ul class="dropdown-menu">' +
              '<li><a href="' + link("events/event.html") + '">Calendar</a></li>' +
              '<li><a href="' + link("events/forms.html") + '">Forms</a></li>' +
              '<li><a href="' + link("events/validate.html") + '">Check Status</a></li>' +
              '<li style="border-bottom: 1px solid var(--border-light); margin: 4px 0;"></li>' +
              '<li><a href="' + link("events/gallery.html") + '">Event Gallery</a></li>' +
              '<li><a href="' + link("events/result.html") + '">Competition Results</a></li>' +
              '<li style="border-bottom: 1px solid #eee; margin: 4px 0;"></li>' +
              '<li><a href="' + link("events/gallery.html?page=Viewer&FolderID=1fsj9LVTFptG3KDaQt9RF5_WSlVIoG2P_&Name=BTLED%20MAINTENANCE%20MONITORING") + '">Hallway Monitoring</a></li>' +
            '</ul>' +
          '</div>' +
          profileNav +
          '<div class="dropdown">' +
            '<a href="#" class="nav-link">Contact Us &#9662;</a>' +
            '<ul class="dropdown-menu">' +
              '<li><a href="mailto:urscbtledorg@gmail.com">Email</a></li>' +
              '<li><a href="tel:+639700337672">Phone</a></li>' +
              '<li><a href="https://www.facebook.com/share/1H2gZ3VW9P/" target="_blank">Facebook</a></li>' +
            '</ul>' +
          '</div>' +
        '</nav>' +
      '</div>';

    var toggleBtn = header.querySelector(".menu-toggle");
    var navMenu = header.querySelector(".nav-menu");
    var dropdowns = header.querySelectorAll(".dropdown");
    var logoutLink = header.querySelector("#logout-link");

    if (toggleBtn && navMenu) {
      toggleBtn.addEventListener("click", function () {
        toggleBtn.classList.toggle("active");
        navMenu.classList.toggle("active");
      });
    }

    if (logoutLink) {
      logoutLink.addEventListener("click", function (e) {
        e.preventDefault();
        if (confirm("Are you sure you want to log out?")) {
          localStorage.removeItem("btled_student");
          window.dispatchEvent(new Event("storage"));
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

// Feature 2 Added: Active Page Highlighting (Fixed)
    var currentHref = window.location.href.split("#")[0];
    var navLinks = header.querySelectorAll(".nav-menu a");
    navLinks.forEach(function (linkEl) {
      var rawHref = linkEl.getAttribute("href");
      
      // Skip links that don't exist, are just "#", or are mailto/tel protocols
      if (!rawHref || rawHref === "#" || rawHref.startsWith("mailto:") || rawHref.startsWith("tel:")) {
        return;
      }

      var linkBase = linkEl.href ? linkEl.href.split("#")[0] : "";
      if (linkBase && linkBase === currentHref) {
        linkEl.classList.add("active-page");
        
        // Optional: If you want the parent dropdown title highlighted ONLY IF 
        // you are on an actual sub-page, you can keep or adjust this logic. 
        // Usually, it's better to only highlight the exact dropdown child item:
        var parentDropdown = linkEl.closest(".dropdown");
        if (parentDropdown && !linkEl.classList.contains("nav-link")) {
          var dropdownLink = parentDropdown.querySelector(".nav-link");
          // Uncomment below line only if you want the main dropdown title to highlight too:
          // if (dropdownLink) dropdownLink.classList.add("active-page");
        }
      }
    });
  }

  // Feature 3 Added: Global Click-Outside-to-Close Handler
  document.addEventListener("click", function (e) {
    var header = document.getElementById("site-navbar");
    if (!header) return;
    if (!header.contains(e.target)) {
      var navMenu = header.querySelector(".nav-menu");
      var toggleBtn = header.querySelector(".menu-toggle");
      var dropdowns = header.querySelectorAll(".dropdown");
      
      if (navMenu) navMenu.classList.remove("active");
      if (toggleBtn) toggleBtn.classList.remove("active");
      dropdowns.forEach(function (d) { d.classList.remove("active"); });
    }
  });

  // Feature 1 Added: Real-Time Multi-Tab Session & State Synchronization
  window.addEventListener("storage", function (e) {
    if (!e.key || e.key === "btled_student" || e.key === "btled_notifications") {
      renderNavbar();
    }
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", renderNavbar);
  } else {
    renderNavbar();
  }
})();