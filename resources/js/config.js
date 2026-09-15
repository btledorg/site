const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbx0yXSNWkVCPjNGn9fFT4HRkKLgh7CJnNek604Be08n-oY3PaEDJZIapCGZlvxrvJE/exec";
const TERM = "2627";;
const SEMESTER = "1";

// BTLED Session Management and Activity Logging
(function () {
  "use strict";

  const APPS_SCRIPT_URL_LOGGING = "https://script.google.com/macros/s/AKfycbzKbuWzST_psh8vfyTM9a8ynK4h8vyLBEf1MhCfZjstigaHOpPKA_3IpkovgJZqHHfw/exec"; // <--- Paste your /exec link here
  const STORAGE_KEY_SESSION = "btled_session_meta";
  const STORAGE_KEY_STUDENT = "btled_student";
  const STORAGE_KEY_LAST_PAGE = "btled_last_logged_page";
  const STORAGE_KEY_LAST_TIME = "btled_last_logged_time";

  function checkSessionAndLogActivity() {
    const studentDataStr = localStorage.getItem(STORAGE_KEY_STUDENT);
    if (!studentDataStr) return;

    let student;
    try {
      student = JSON.parse(studentDataStr);
    } catch (e) {
      return;
    }

    const now = new Date().getTime();
    let sessionMeta = JSON.parse(localStorage.getItem(STORAGE_KEY_SESSION) || "{}");
    const expiryTimestamp = sessionMeta.expiryTimestamp || 0;

    const isClockHourExpired = expiryTimestamp === 0 || now > expiryTimestamp;

    const surname = student.Surname || student.surname || '';
    const firstName = student["First Name"] || student.firstName || '';
    const fullName = surname && firstName ? `${surname}, ${firstName}`.trim() : (student.name || 'Unknown');
    const studentNo = student["Student No."] || student.studentNo || student.id || 'Unknown';
    const program = student.Program || student.program || 'BTLED-IA';

    if (isClockHourExpired) {

      const lastLoggedPage = localStorage.getItem(STORAGE_KEY_LAST_PAGE) || window.location.pathname;
      const storedLastTime = Number(localStorage.getItem(STORAGE_KEY_LAST_TIME));
      const lastLoggedTime = storedLastTime && !isNaN(storedLastTime) ? storedLastTime : now;

      sendAppsScriptLog({
        studentNo: studentNo,
        fullName: fullName,
        program: program,
        action: 'SESSION_EXPIRED',
        page: lastLoggedPage,
        timestamp: new Date(lastLoggedTime).toISOString(),
        userAgent: navigator.userAgent
      }, true);

      localStorage.removeItem(STORAGE_KEY_LAST_PAGE);
      localStorage.removeItem(STORAGE_KEY_LAST_TIME);
      localStorage.removeItem(STORAGE_KEY_SESSION);

      return;
    }

    sendAppsScriptLog({
      studentNo: studentNo,
      fullName: fullName,
      program: program,
      action: 'SILENT_PAGE_VISIT',
      page: window.location.pathname,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent
    });
  }

  function initializeSession() {
    if (!localStorage.getItem(STORAGE_KEY_SESSION) && localStorage.getItem(STORAGE_KEY_STUDENT)) {
      const now = new Date();
      const nextHourTimestamp = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() + 1, 0, 0, 0).getTime();

      const meta = {
        expiryTimestamp: nextHourTimestamp,
        loginTime: now.toISOString()
      };
      localStorage.setItem(STORAGE_KEY_SESSION, JSON.stringify(meta));
    }
  }

  function sendAppsScriptLog(payload, bypassThrottle) {
    if (!APPS_SCRIPT_URL_LOGGING || APPS_SCRIPT_URL_LOGGING.includes("YOUR_APPS_SCRIPT_EXEC_URL_HERE")) {
      console.log("Apps Script Exec URL not set. Mock Log:", payload);
      return;
    }

    if (!bypassThrottle) {
      const nowTime = new Date(payload.timestamp).getTime();

      if (localStorage.getItem(STORAGE_KEY_LAST_PAGE) === payload.page && (nowTime - Number(localStorage.getItem(STORAGE_KEY_LAST_TIME) || 0) < 60000)) {
        return;
      }

      localStorage.setItem(STORAGE_KEY_LAST_PAGE, payload.page);
      localStorage.setItem(STORAGE_KEY_LAST_TIME, nowTime);
    }

    fetch(APPS_SCRIPT_URL_LOGGING, {
      method: "POST",
      mode: "no-cors",
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },
      body: JSON.stringify(payload)
    }).catch(err => {
      console.error("Failed to send silent log:", err);
    });
  }

  document.addEventListener("DOMContentLoaded", function() {
    initializeSession();
    checkSessionAndLogActivity();
  });
})();
(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','GTM-NQZHH3RH');

var Tawk_API = Tawk_API || {}, Tawk_LoadStart = new Date();

try {
  var studentData = JSON.parse(localStorage.getItem("btled_student"));

  if (studentData) {
    Tawk_API.visitor = {
      name: ((studentData.name || "") + " " + (studentData.surname || "")).trim(),
      email: studentData.email || ""
    };

    Tawk_API.onLoad = function() {
      Tawk_API.setAttributes({
        'Student ID': studentData.id || studentData['Student No.'],
        'Program': studentData.program || studentData['Program'],
        'Contact Number': studentData.contact || studentData['Contact Number'],
        'Address': (studentData.street || "") + ", " + (studentData.municipality || "")
      }, function (error) {
        if (error) console.warn("Tawk.to attributes error:", error);
      });
    };
  }
} catch (err) {
  console.warn("Could not load student data into Tawk.to:", err);
}

(function(){
  var s1 = document.createElement("script"), s0 = document.getElementsByTagName("script")[0];
  s1.async = true;
  s1.src = 'https://embed.tawk.to/6aa375751e12513447b8045a/1k2785lfv';
  s1.charset = 'UTF-8';
  s1.setAttribute('crossorigin', '*');
  if (s0 && s0.parentNode) {
    s0.parentNode.insertBefore(s1, s0);
  }
})();