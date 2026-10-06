import { protectPage, logout, highlightSidebar } from "./guard.js";

const user = await protectPage();
const nama = user.nama || user.email;
highlightSidebar();
const initial = nama.charAt(0).toUpperCase();
document.getElementById("welcomeNama").textContent = nama.split(" ")[0];
document.getElementById("sidebarNama").textContent = nama;
document.getElementById("sidebarRole").textContent = user.role;
document.getElementById("avatarInitial").textContent = initial;

// Tanggal
const hari = ["Minggu","Senin","Selasa","Rabu","Kamis","Jumat","Sabtu"];
const bulan = ["Januari","Februari","Maret","April","Mei","Juni",
               "Juli","Agustus","September","Oktober","November","Desember"];
const now = new Date();
document.getElementById("todayDate").textContent =
  `${hari[now.getDay()]}, ${now.getDate()} ${bulan[now.getMonth()]} ${now.getFullYear()}`;

// Shift
const jam = now.getHours();
let shift = "1";
if (jam >= 15 && jam < 23) shift = "2";
else if (jam >= 23 || jam < 7) shift = "3";
document.getElementById("shiftAktif").textContent = shift;

// Admin nav
if (user.role === "superadmin") {
  document.getElementById("adminLabel").style.display = "block";
  document.getElementById("adminNav").style.display = "block";
  document.getElementById("cardAdmin").style.display = "block";
}

// Logout
document.getElementById("btnLogout").addEventListener("click", logout);

// Sidebar mobile
const sidebar = document.getElementById("sidebar");
const overlay = document.getElementById("sidebarOverlay");
document.getElementById("btnMenu").addEventListener("click", () => {
  sidebar.classList.add("open"); overlay.classList.add("show");
});
overlay.addEventListener("click", () => {
  sidebar.classList.remove("open"); overlay.classList.remove("show");
});