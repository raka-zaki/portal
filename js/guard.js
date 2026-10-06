import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// allowedRoles: array role yang boleh akses halaman ini
export function protectPage(allowedRoles = []) {
  return new Promise((resolve, reject) => {
    onAuthStateChanged(auth, async (user) => {
      if (!user) {
        window.location.href = "index.html";
        return reject("not-logged-in");
      }
      const userDoc = await getDoc(doc(db, "users", user.uid));
      if (!userDoc.exists()) {
        await signOut(auth);
        window.location.href = "index.html";
        return reject("no-user-data");
      }
      const data = userDoc.data();
      if (allowedRoles.length && !allowedRoles.includes(data.role)) {
        alert("Kamu tidak punya akses ke halaman ini.");
        window.location.href = "portal.html";
        return reject("forbidden");
      }
      resolve({ uid: user.uid, ...data });
    });
  });
}

export async function logout() {
  await signOut(auth);
  window.location.href = "index.html";
}
// Auto-highlight sidebar sesuai halaman aktif
export function highlightSidebar() {
  const path = window.location.pathname.split("/").pop() || "portal.html";
  const params = new URLSearchParams(window.location.search);
  const kategori = params.get("kategori");

  // Hapus semua active dulu
  document.querySelectorAll(".sidebar-nav a").forEach(a => a.classList.remove("active"));

  // Tentukan href yang cocok
  let target = path;
  if (path === "checklist.html" && kategori) {
    target = `checklist.html?kategori=${kategori}`;
  }

  // Cari link yang href-nya cocok
  document.querySelectorAll(".sidebar-nav a").forEach(a => {
    const href = a.getAttribute("href");
    if (href === target || href === path) {
      a.classList.add("active");
    }
  });
}