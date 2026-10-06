import { auth, db } from "./firebase-config.js";
import { signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const DOMAIN = "@produksi.local"; // domain palsu

const form = document.getElementById("loginForm");
const errBox = document.getElementById("errorMsg");
const btn = document.getElementById("btnLogin");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errBox.classList.add("d-none");
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Loading...';

  const username = document.getElementById("username").value.trim().toLowerCase();
  const password = document.getElementById("password").value;

  if (!/^[a-z0-9._-]+$/.test(username)) {
    errBox.textContent = "Username cuma boleh huruf, angka, titik, underscore, strip.";
    errBox.classList.remove("d-none");
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-box-arrow-in-right"></i> Login';
    return;
  }

  const email = username + DOMAIN;

  try {
    const userCred = await signInWithEmailAndPassword(auth, email, password);
    const userDoc = await getDoc(doc(db, "users", userCred.user.uid));
    if (!userDoc.exists()) throw new Error("Data user tidak ditemukan.");
    const role = userDoc.data().role;
    window.location.href = role === "superadmin" ? "superadmin.html" : "portal.html";
  } catch (err) {
    let msg = "Login gagal. Periksa username & password.";
    if (err.code === "auth/invalid-credential") msg = "Username atau password salah.";
    if (err.code === "auth/user-not-found") msg = "User tidak terdaftar.";
    errBox.textContent = msg;
    errBox.classList.remove("d-none");
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-box-arrow-in-right"></i> Login';
  }
});