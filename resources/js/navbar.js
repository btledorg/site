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

  function renderNavbar() {
    var header = document.getElementById("site-navbar");
    if (!header) return;

    var ROOT = normalizeRoot(header.getAttribute("data-root") || "./");
    function link(path) { return joinPath(ROOT, path); }

    var hasStudentProfile = false;
    try {
      hasStudentProfile = !!JSON.parse(localStorage.getItem("btled_student"));
    } catch (e) {
      hasStudentProfile = false;
    }

    var profileNav = hasStudentProfile ?
      '<div class="dropdown">' +
        '<a href="' + link("profile/index.html") + '" class="nav-link">My Profile &#9662;</a>' +
        '<ul class="dropdown-menu">' +
          '<li><a href="' + link("profile/card.html") + '">BTLED Card</a></li>' +
          '<li><a href="' + link("profile/participations.html") + '">Participations</a></li>' +
          '<li style="border-bottom: 1px solid #eee; margin: 4px 0;"></li>' +
          '<li><a href="' + link("profile/index.html") + '">My Profile</a></li>' +
        '</ul>' +
      '</div>' : "";

    // Populate inside the existing <header> tag without creating a new header element
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
              '<li><a href="' + link("about/#history-constitution") + '">History &amp; Constitution</a></li>' +
              '<li><a href="' + link("about/#spotlight") + '">Vision &amp; Mission</a></li>' +
              '<li><a href="' + link("about/logo.html") + '">BTLED LOGO</a></li>' +
              '<li><a href="' + link("about/#officers") + '">Executive Officers</a></li>' +
              '<li style="border-bottom: 1px solid #eee; margin: 4px 0;"></li>' +
              '<li><a href="' + link("about/documents.html#achievements") + '">Achievements &amp; Awards</a></li>' +
              '<li><a href="' + link("about/documents.html#permits") + '">Permits &amp; Certifications</a></li>' +
            '</ul>' +
          '</div>' +
          '<a href="' + link("finance/budget.html") + '" class="nav-link">Finance</a>' +
'<div class="dropdown">' +
            '<a href="' + link("events/event.html") + '" class="nav-link">Events &#9662;</a>' +
            '<ul class="dropdown-menu">' +
              '<li><a href="' + link("events/forms.html") + '">Forms</a></li>' +
              '<li><a href="' + link("validate.html") + '">Check Status</a></li>' +
              '<li style="border-bottom: 1px solid #eee; margin: 4px 0;"></li>' +
              '<li><a href="' + link("events/certificates.html") + '">Certificates</a></li>' +
              '<li style="border-bottom: 1px solid #eee; margin: 4px 0;"></li>' +
              '<li><a href="' + link("events/gallery.html") + '">Event Gallery</a></li>' +
              '<li><a href="' + link("events/results.html") + '">Competition Results</a></li>' +
            '</ul>' +
          '</div>' +
          profileNav +
          '<div class="dropdown">' +
            '<a href="#" class="nav-link">Contact Us &#9662;</a>' +
            '<ul class="dropdown-menu">' +
              '<li><a href="mailto:email@example.com">Email</a></li>' +
              '<li><a href="tel:+63000000000">Phone</a></li>' +
              '<li><a href="' + link("#location") + '">Location</a></li>' +
            '</ul>' +
          '</div>' +
        '</nav>' +
      '</div>';

    // Bind event listeners directly to the populated elements
    var toggleBtn = header.querySelector(".menu-toggle");
    var navMenu = header.querySelector(".nav-menu");
    var dropdowns = header.querySelectorAll(".dropdown");

    if (toggleBtn && navMenu) {
      toggleBtn.addEventListener("click", function () {
        toggleBtn.classList.toggle("active");
        navMenu.classList.toggle("active");
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
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", renderNavbar);
  } else {
    renderNavbar();
  }
})();