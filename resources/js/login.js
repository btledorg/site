  const baseURL ="https://script.google.com/macros/s/AKfycbzRvZQoEZXf_du3jDCO7m5VjKy9K8R4mIE1tg6ojZeIdKwb9CvEpHcWhcg7n5DurVE/exec";

  document.addEventListener("DOMContentLoaded", () => {
    checkUserSession();

    // Helper to show alert cards nicely on top
    function showAlert(type, elementId, message) {
      const alertEl = document.getElementById(elementId);
      alertEl.className = `auth-alert ${type}`;
      alertEl.textContent = message;
    }

    // Handle "Continue" submit (identify / look up existing record)
    document
      .getElementById("login-form")
      .addEventListener("submit", async (e) => {
        e.preventDefault();
        const id = document.getElementById("login-id").value.trim();
        const name = document.getElementById("login-name").value.trim();
        const surname = document
          .getElementById("login-surname")
          .value.trim();
        const btn = document.getElementById("login-btn");

        btn.classList.add("loading");
        btn.disabled = true;
        showAlert("success", "login-alert", "Checking our records...");

        const targetUrl = `${baseURL}?module=validate&id=${encodeURIComponent(id)}&name=${encodeURIComponent(name)}&surname=${encodeURIComponent(surname)}`;

        try {
          const response = await fetch(targetUrl);
          const result = await response.json();

          if (result && result.found) {
            const userData = { id, name, surname, ...result.data };
            localStorage.setItem("btled_student", JSON.stringify(userData));
            closeAuthModal();
            updateParentNav(userData);
          } else if (result && result.ok === false) {
            showAlert(
              "error",
              "login-alert",
              result.error || "Something went wrong on our end.",
            );
            btn.classList.remove("loading");
            btn.disabled = false;
          } else {
            // Switch to the "get to know you" registration view if not found
            document.getElementById("reg-id").value = id;
            document.getElementById("reg-name").value = name;
            document.getElementById("reg-surname").value = surname;
            switchView(
              document.getElementById("login-view"),
              document.getElementById("register-view"),
            );
            btn.classList.remove("loading");
            btn.disabled = false;
          }
        } catch (err) {
          showAlert(
            "error",
            "login-alert",
            "We couldn't reach our system. Please check your connection and try again.",
          );
          btn.classList.remove("loading");
          btn.disabled = false;
        }
      });

    // Handle Registration Submit
    document
      .getElementById("register-form")
      .addEventListener("submit", async (e) => {
        e.preventDefault();
        const btn = document.getElementById("reg-btn");
        btn.classList.add("loading");
        btn.disabled = true;
        showAlert("success", "reg-alert", "Saving your details...");

        const payload = {
          module: "register",
          id: document.getElementById("reg-id").value,
          surname: document.getElementById("reg-surname").value,
          name: document.getElementById("reg-name").value,
          middleName: document.getElementById("reg-mname").value,
          program: document.getElementById("reg-program").value,
          sex: document.getElementById("reg-sex").value,
          birthdate: document.getElementById("reg-bdate").value,
          street: document.getElementById("reg-street").value,
          municipality: document.getElementById("reg-city").value,
          province: document.getElementById("reg-prov").value,
          contact: document.getElementById("reg-contact").value,
          email: document.getElementById("reg-email").value,
          website: document.getElementById("reg-website").value,
        };

        const targetUrl = `${baseURL}?${new URLSearchParams(payload).toString()}`;

        try {
          const response = await fetch(targetUrl);
          const result = await response.json();

          if (result && result.ok) {
            localStorage.setItem("btled_student", JSON.stringify(payload));
            closeAuthModal();
            updateParentNav(payload);
          } else {
            showAlert(
              "error",
              "reg-alert",
              (result && result.error) ||
                "We couldn't save your details. Please try again.",
            );
            btn.classList.remove("loading");
            btn.disabled = false;
          }
        } catch (err) {
          showAlert(
            "error",
            "reg-alert",
            "We couldn't save your details — please check your connection and try again.",
          );
          btn.classList.remove("loading");
          btn.disabled = false;
        }
      });
  });

  function checkUserSession() {
    const savedUser = localStorage.getItem("btled_student");
    if (!savedUser) {
      openAuthModal();
    } else {
      updateParentNav(JSON.parse(savedUser));
    }
  }

  // Fades/slides the overlay + card in, matching the site's scroll-animation feel
  function openAuthModal() {
    const wrapper = document.getElementById("auth-modal-wrapper");
    wrapper.classList.remove("hidden");
    requestAnimationFrame(() => wrapper.classList.add("is-visible"));
  }

  function closeAuthModal() {
    const wrapper = document.getElementById("auth-modal-wrapper");
    wrapper.classList.remove("is-visible");
    setTimeout(() => wrapper.classList.add("hidden"), 320);
  }

  // Cross-fades between the "get to know you" view and the registration view
  function switchView(hideEl, showEl) {
    hideEl.style.opacity = "0";
    hideEl.style.transform = "translateY(-10px)";
    setTimeout(() => {
      hideEl.classList.add("hidden");
      hideEl.style.opacity = "";
      hideEl.style.transform = "";
      showEl.classList.remove("hidden");
      showEl.style.opacity = "0";
      showEl.style.transform = "translateY(10px)";
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          showEl.style.opacity = "1";
          showEl.style.transform = "translateY(0)";
        });
      });
    }, 260);
  }

  function updateParentNav(user) {
    const navHubLink = document.getElementById("nav-student-hub");
    if (navHubLink) {
      navHubLink.textContent = `Hello, ${user.name}`;
    }
  }