(function () {
  "use strict";

  // Load canvas-confetti dynamically if not already present
  function loadConfettiLibrary(callback) {
    if (window.confetti) {
      callback();
      return;
    }
    var script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.browser.min.js";
    script.onload = callback;
    document.head.appendChild(script);
  }

  function checkAndCelebratBirthday() {
    let student = null;
    try {
      student = JSON.parse(localStorage.getItem("btled_student"));
    } catch (e) {
      return;
    }

    if (!student || !student["Birthdate"]) return;

    // Parse birthdate (Expected format: YYYY-MM-DD or similar parseable date string)
    const birthDate = new Date(student["Birthdate"]);
    if (isNaN(birthDate)) return;

    const today = new Date();
    
    // Check if month and day match today's date
    if (
      birthDate.getDate() === today.getDate() &&
      birthDate.getMonth() === today.getMonth()
    ) {
      // Avoid triggering multiple times per session
      if (sessionStorage.getItem("btled_birthday_celebrated")) return;
      sessionStorage.setItem("btled_birthday_celebrated", "true");

      loadConfettiLibrary(function () {
        triggerBirthdayEffects(student);
      });
    }
  }

  function triggerBirthdayEffects(student) {
    const firstName = student["First Name"] || student.name || "Celebrant";

    // 1. Inject Birthday CSS Styles
    const style = document.createElement("style");
    style.innerHTML = `
      @keyframes floatSlow {
        0%, 100% { transform: translateY(0px) rotate(0deg); }
        50% { transform: translateY(-10px) rotate(3deg); }
      }
      .birthday-banner-toast {
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: linear-gradient(135deg, #4462ba, #1d4ed8);
        color: #ffffff;
        padding: 1rem 1.25rem;
        border-radius: 8px;
        box-shadow: 0 10px 25px rgba(29, 78, 216, 0.3);
        z-index: 9999;
        display: flex;
        align-items: center;
        gap: 1rem;
        font-family: inherit;
        animation: floatSlow 3s ease-in-out infinite;
        border: 2px solid rgba(255,255,255,0.2);
        max-width: 320px;
      }
      .birthday-banner-toast h4 {
        margin: 0 0 0.2rem 0;
        font-size: 1rem;
        font-weight: 800;
      }
      .birthday-banner-toast p {
        margin: 0;
        font-size: 0.8rem;
        opacity: 0.9;
      }
      .birthday-close-btn {
        background: transparent;
        border: none;
        color: white;
        font-size: 1.2rem;
        cursor: pointer;
        opacity: 0.8;
      }
      .birthday-close-btn:hover { opacity: 1; }
      
      /* Add glowing effect to profile header if present */
      .profile-header {
        box-shadow: 0 0 25px rgba(68, 98, 186, 0.5) !important;
        border: 2px solid #4462ba !important;
      }
    `;
    document.head.appendChild(style);

    // 2. Trigger Confetti Fireworks
    var duration = 3 * 1000;
    var animationEnd = Date.now() + duration;
    var defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 10000 };

    function randomInRange(min, max) {
      return Math.random() * (max - min) + min;
    }

    var interval = setInterval(function () {
      var timeLeft = animationEnd - Date.now();
      if (timeLeft <= 0) {
        return clearInterval(interval);
      }
      var particleCount = 50 * (timeLeft / duration);
      confetti(Object.assign({}, defaults, { particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } }));
      confetti(Object.assign({}, defaults, { particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } }));
    }, 250);

    // 3. Create Celebratory Toast Notification
    const toast = document.createElement("div");
    toast.className = "birthday-banner-toast";
    toast.innerHTML = `
      <div style="font-size: 2rem;">🎉</div>
      <div style="flex-grow: 1;">
        <h4>Happy Birthday, ${escapeHtml(firstName)}!</h4>
        <p>The BTLED Organization wishes you a wonderful and prosperous day!</p>
      </div>
      <button class="birthday-close-btn" onclick="this.parentElement.remove()">&times;</button>
    `;
    document.body.appendChild(toast);

    // Auto-dismiss toast after 10 seconds
    setTimeout(() => {
      if (toast.parentElement) toast.remove();
    }, 10000);
  }

  function escapeHtml(str) {
    return String(str == null ? "" : str).replace(
      /[&<>"']/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
    );
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", checkAndCelebratBirthday);
  } else {
    checkAndCelebratBirthday();
  }
})();