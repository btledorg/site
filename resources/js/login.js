const baseURL =
  "https://script.google.com/macros/s/AKfycbx0yXSNWkVCPjNGn9fFT4HRkKLgh7CJnNek604Be08n-oY3PaEDJZIapCGZlvxrvJE/exec";

document.addEventListener("DOMContentLoaded", () => {
  checkUserSession();
  populateProgramSuggestions();

  function showAlert(type, elementId, message) {
    const alertEl = document.getElementById(elementId);
    alertEl.className = `auth-alert ${type}`;
    alertEl.textContent = message;
  }

  document
    .getElementById("login-form")
    .addEventListener("submit", async (e) => {
      e.preventDefault();
      const id = document.getElementById("login-id").value.trim();
      const name = document.getElementById("login-name").value.trim();
      const surname = document.getElementById("login-surname").value.trim();
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
        } else if (result && result.ok === false) {
          showAlert(
            "error",
            "login-alert",
            result.error || "Something went wrong on our end.",
          );
          btn.classList.remove("loading");
          btn.disabled = false;
        } else {
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
          // Saves the full payload (including birthdate) directly to localStorage
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

// Edit these to change what shows up as suggestions.
// The field stays fully editable — this just offers hints via <datalist>.

const PROGRAM_CODES = [
  "BAJ",
  "BSHM",
  "BSTM",
  "BAELS",
  "BAVCM",
  "BMEF",
  "BMEE",
  "BEED",
  "BSEE",
  "BSEF",
  "BSEM",
  "BSESW",
  "BSES",
  "BSESS",
  "BSBAHRM",
  "BSBAMM",
  "BSBAFM",
  "BSBAHRDM",
  "BSOA",
  "BSOAM",
  "BSCE",
  "BSCpE",
  "BSEE-Eng",
  "BSEcE",
  "BSME",
  "BSPsy",
  "BSHS",
  "BSMath",
  "BSAcc",
  "BSIS",
  "BSIT",
  "BTLED-IA",
  "BTLED-HE",
  "BTLED-ICT",
  "BSFAS",
  "BSBMIC",
  "BSBAN",
  "BTTVTE-CT",
  "BTTVTE-DT",
  "BTTVTE-ElcT",
  "BTTVTE-EleT",
  "BTT-AT",
  "BTT-EcT",
  "BTT-ElT",
  "BTT-CCT",
  "BTT-DT",
  "BTT-MT",
  "BTT-HVACT",
  "BAPS",
  "BSABE",
  "BSAAS",
  "BSACS",
  "BSBio",
  "BSSW",
  "BSAgri",
  "BSN",
  "BSED",
];
const PROGRAM_YEARS = ["1", "2", "3", "4"];
const PROGRAM_SECTIONS = ["A", "B", "C", "D"];

function populateProgramSuggestions() {
  const datalist = document.getElementById("programSuggestions");
  if (!datalist) return;
  datalist.innerHTML = "";
  const frag = document.createDocumentFragment();

  // Bare codes, in case someone just wants the program without year/section
  PROGRAM_CODES.forEach((code) => {
    const opt = document.createElement("option");
    opt.value = code;
    frag.appendChild(opt);
  });

  // Code + Year/Section combos, e.g. "BTLED-IA 1A"
  PROGRAM_CODES.forEach((code) => {
    PROGRAM_YEARS.forEach((year) => {
      PROGRAM_SECTIONS.forEach((section) => {
        const opt = document.createElement("option");
        opt.value = `${code} ${year}${section}`;
        frag.appendChild(opt);
      });
    });
  });

  datalist.appendChild(frag);
}
