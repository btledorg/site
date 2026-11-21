// Shared helper: syncs ID photo & signature with Google Drive via Apps Script.
// Requires config.js (APPS_SCRIPT_URL) to be loaded first.
const MediaSync = (() => {
  function identity(student) {
    return {
      studentNo: student["Student No."] || student.id || "",
      firstName: student["First Name"] || student.name || "",
      surname: student["Surname"] || student.surname || "",
    };
  }

  async function post(payload) {
    // No custom headers -> avoids CORS preflight with Apps Script
    const res = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return res.json();
  }

  // kind: "photo" | "signature"
  function upload(student, kind, dataUrl) {
    return post({ action: "saveMedia", ...identity(student), kind, dataUrl });
  }

  function remove(student, kind) {
    return post({ action: "removeMedia", ...identity(student), kind });
  }

  async function fetchAll(student) {
    const id = identity(student);
    const url =
      `${APPS_SCRIPT_URL}?module=getmedia` +
      `&id=${encodeURIComponent(id.studentNo)}` +
      `&firstName=${encodeURIComponent(id.firstName)}` +
      `&surname=${encodeURIComponent(id.surname)}`;
    const res = await fetch(url);
    return res.json(); // { ok, photo, signature } (data URLs or null)
  }

  return { upload, remove, fetchAll };
})();