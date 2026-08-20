/**
 * SHARED SITE NAVBAR
 * ---------------------------------------------------------------
 * Why this exists: every page used to have its own hand-copied
 * <header class="navbar">...</header> block, each with its own set
 * of "../" relative paths. Typos like "..//about/index.html" (an
 * extra slash) crept in on some pages, and because links are
 * relative, navigating page-to-page COMPOUNDS a bad slash instead
 * of just breaking one link — that's how a URL ends up looking like
 * ".../site//////finance/budget.html".
 *
 * Fix: define the nav ONCE, here. Every page just tells this script
 * how deep it is (via data-root), and this script builds every link
 * from that single value. Even if data-root itself has a typo (e.g.
 * "..//"), normalizeRoot() below cleans it up before it's used, so
 * a stray slash can never leak into a link.
 *
 * USAGE — put this in every page, where the old <header> used to be:
 *
 *   <div id="site-navbar" data-root="./"></div>
 *   <script src="resources/js/navbar.js"></script>
 *
 * data-root is just "how many folders deep is this page from the
 * site root":
 *   - site root (index.html)              -> data-root="./"
 *   - one folder deep (about/index.html)  -> data-root="../"
 *   - two folders deep                    -> data-root="../../"
 *
 * and the <script src="..."> path itself should point at this file
 * the normal way (e.g. "../resources/js/navbar.js" from one level
 * deep). That's the ONLY relative path you still have to get right
 * per page — everything else is generated from it.
 */
(function () {
  "use strict";

  function normalizeRoot(root) {
    if (!root) return "./";
    var cleaned = String(root).replace(/\/{2,}/g, "/"); // collapse // -> /
    if (!/\/$/.test(cleaned)) cleaned += "/"; // ensure exactly one trailing slash
    return cleaned;
  }

  function joinPath(root, path) {
    return normalizeRoot(root) + String(path || "").replace(/^\/+/, "");
  }

  // Defensive net: if ANY link anywhere on the page (not just the nav)
  // ends up with a doubled-up slash — old content, a manual edit, etc. —
  // clean it rather than let it silently break.
  function cleanupStraySlashes() {
    document.querySelectorAll("a[href]").forEach(function (a) {
      var href = a.getAttribute("href");
      if (!href) return;
      // collapse runs of slashes, but never touch the "://" after a scheme
      var cleaned = href.replace(/([^:]\/)\/+/g, "$1");
      if (cleaned !== href) a.setAttribute("href", cleaned);
    });
  }

  function renderNavbar() {
    var mount = document.getElementById("site-navbar");
    if (!mount) return;

    var ROOT = normalizeRoot(mount.getAttribute("data-root") || "./");
    function link(path) {
      return joinPath(ROOT, path);
    }

    // IMPORTANT: use outerHTML, not innerHTML. innerHTML would leave the
    // <header> nested one level deep inside <div id="site-navbar">, which
    // breaks any CSS that depends on the header being a direct child of
    // <body> (e.g. sticky/fixed positioning, "body > .navbar" selectors).
    // outerHTML replaces the wrapper itself, so <header class="navbar">
    // ends up in exactly the same place it was before.
    var headerHtml =
      '<header class="navbar">' +
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
      '<div class="dropdown">' +
      '<a href="' + link("about/index.html") + '" class="nav-link">About Us &#9662;</a>' +
      '<ul class="dropdown-menu">' +
      '<li><a href="' + link("about/index.html#history-constitution") + '">History &amp; Constitution</a></li>' +
      '<li><a href="' + link("about/index.html#spotlight") + '">Vision &amp; Mission</a></li>' +
      '<li><a href="' + link("about/logo.html") + '">BTLED LOGO</a></li>' +
      '<li><a href="' + link("about/index.html#officers") + '">Executive Officers</a></li>' +
      '<li><a href="' + link("about/documents.html#achievements") + '">Achievements &amp; Awards</a></li>' +
      '<li><a href="' + link("about/documents.html#permits") + '">Permits &amp; Certifications</a></li>' +
      "</ul>" +
      "</div>" +
      '<a href="' + link("finance/budget.html") + '" class="nav-link">Finance</a>' +
      '<a href="' + link("events/event.html") + '" class="nav-link">Events</a>' +
      '<a href="' + link("events/forms.html") + '" class="nav-link">Forms</a>' +
      '<div class="dropdown">' +
      '<a href="#" class="nav-link">Contact Us &#9662;</a>' +
      '<ul class="dropdown-menu">' +
      '<li><a href="mailto:email@example.com">Email</a></li>' +
      '<li><a href="tel:+63000000000">Phone</a></li>' +
      '<li><a href="' + link("index.html#location") + '">Location</a></li>' +
      "</ul>" +
      "</div>" +
      "</nav>" +
      "</div>" +
      "</header>";

    mount.outerHTML = headerHtml;

    initNavbarBehavior();
    cleanupStraySlashes();
  }

  function initNavbarBehavior() {
    var menuToggle = document.querySelector(".menu-toggle");
    var navMenu = document.querySelector(".nav-menu");
    var dropdowns = document.querySelectorAll(".dropdown");
    if (!menuToggle || !navMenu) return;

    menuToggle.addEventListener("click", function () {
      menuToggle.classList.toggle("active");
      navMenu.classList.toggle("active");
    });

    dropdowns.forEach(function (dropdown) {
      var toggleLink = dropdown.querySelector(".nav-link");
      toggleLink.addEventListener("click", function (e) {
        if (window.innerWidth <= 850) {
          e.preventDefault();
          dropdown.classList.toggle("active");
        }
      });
    });

    document.querySelectorAll(".dropdown-menu a").forEach(function (a) {
      a.addEventListener("click", function () {
        if (window.innerWidth <= 850) {
          menuToggle.classList.remove("active");
          navMenu.classList.remove("active");
          dropdowns.forEach(function (d) { d.classList.remove("active"); });
        }
      });
    });

    document.addEventListener("click", function (e) {
      if (window.innerWidth <= 850 && !e.target.closest(".navbar")) {
        menuToggle.classList.remove("active");
        navMenu.classList.remove("active");
        dropdowns.forEach(function (d) { d.classList.remove("active"); });
      }
    });

    window.addEventListener("resize", function () {
      if (window.innerWidth > 850) {
        menuToggle.classList.remove("active");
        navMenu.classList.remove("active");
        dropdowns.forEach(function (d) { d.classList.remove("active"); });
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", renderNavbar);
  } else {
    renderNavbar();
  }
})();