import { db, storage } from "./firebase-config.js";
import { protectPage, logout } from "./guard.js";
import {
  collection, addDoc, getDocs, query, where, orderBy,
  serverTimestamp, doc, getDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  ref, uploadBytes, getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

// ---------- GUARD ----------
const user = await protectPage();
document.getElementById("sidebarNama").textContent = user.nama || user.email;
document.getElementById("sidebarRole").textContent = user.role;
document.getElementById("avatarInitial").textContent =
  (user.nama || user.email).charAt(0).toUpperCase();

// Sidebar mobile
const sidebar = document.getElementById("sidebar");
const overlay = document.getElementById("sidebarOverlay");
document.getElementById("btnMenu").addEventListener("click", () => {
  sidebar.classList.add("open"); overlay.classList.add("show");
});
overlay.addEventListener("click", () => {
  sidebar.classList.remove("open"); overlay.classList.remove("show");
});

// Admin nav
if (user.role === "superadmin") {
  document.getElementById("adminLabel").style.display = "block";
  document.getElementById("adminNav").style.display = "block";
}

// Logout
document.getElementById("btnLogout").addEventListener("click", logout);

// Shift aktif auto
const now = new Date();
const jam = now.getHours();
let shiftAktif = "1";
if (jam >= 15 && jam < 23) shiftAktif = "2";
else if (jam >= 23 || jam < 7) shiftAktif = "3";
document.getElementById("shiftAktif").textContent = shiftAktif;
document.getElementById("inputShift").value = shiftAktif;

// ---------- LOAD LANTAI ----------
let lantaiList = [];
async function loadLantai() {
  const q = query(collection(db, "lantai"), orderBy("urutan", "asc"));
  const snap = await getDocs(q);
  lantaiList = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(l => l.aktif !== false);

  const opt = lantaiList
    .map(l => `<option value="${l.id}">${l.nama}</option>`)
    .join("");
  document.getElementById("inputLantai").insertAdjacentHTML("beforeend", opt);
  document.getElementById("filterLantai").insertAdjacentHTML("beforeend", opt);
}
await loadLantai();

// ---------- FOTO HANDLER ----------
const fotoInput = document.getElementById("inputFoto");
const fotoDrop = document.getElementById("fotoDrop");
const fotoPreview = document.getElementById("fotoPreview");
const fotoImg = document.getElementById("fotoImg");
let fotoFile = null;

fotoDrop.addEventListener("click", () => fotoInput.click());
fotoInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) {
    alert("Ukuran foto maksimal 5 MB");
    fotoInput.value = "";
    return;
  }
  fotoFile = file;
  fotoImg.src = URL.createObjectURL(file);
  fotoDrop.style.display = "none";
  fotoPreview.style.display = "block";
});

document.getElementById("btnHapusFoto").addEventListener("click", () => {
  fotoFile = null;
  fotoInput.value = "";
  fotoImg.src = "";
  fotoDrop.style.display = "block";
  fotoPreview.style.display = "none";
});

// ---------- SUBMIT ----------
const form = document.getElementById("formRH");
const btnSubmit = document.getElementById("btnSubmit");

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const lantaiId = document.getElementById("inputLantai").value;
  const shift = document.getElementById("inputShift").value;
  const suhu = parseFloat(document.getElementById("inputSuhu").value);
  const rh = parseFloat(document.getElementById("inputRH").value);
  const catatan = document.getElementById("inputCatatan").value.trim();

  if (!lantaiId) return alert("Pilih lantai dulu");
  if (!fotoFile) return alert("Foto termometer wajib diupload");

  btnSubmit.disabled = true;
  btnSubmit.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Menyimpan...';

  try {
    // Upload foto ke Storage
    const timestamp = Date.now();
    const path = `rh-suhu/${lantaiId}/${timestamp}_${fotoFile.name}`;
    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, fotoFile);
    const fotoUrl = await getDownloadURL(storageRef);

    // Simpan ke Firestore
    const lantaiNama = lantaiList.find(l => l.id === lantaiId)?.nama || "-";
    await addDoc(collection(db, "rhSuhu"), {
      lantaiId,
      lantaiNama,
      shift,
      suhu,
      rh,
      catatan,
      fotoUrl,
      petugasId: user.uid,
      petugasNama: user.nama || user.email,
      timestamp: serverTimestamp(),
      tanggal: new Date().toISOString().slice(0, 10), // YYYY-MM-DD untuk filter
    });

    // Reset form
    form.reset();
    document.getElementById("inputShift").value = shiftAktif;
    fotoFile = null;
    fotoImg.src = "";
    fotoDrop.style.display = "block";
    fotoPreview.style.display = "none";

    // Reload riwayat
    loadRiwayat();
    alert("Data berhasil disimpan ✅");
  } catch (err) {
    alert("Gagal simpan: " + err.message);
  } finally {
    btnSubmit.disabled = false;
    btnSubmit.innerHTML = '<i class="bi bi-send"></i> Simpan Data';
  }
});

// ---------- RIWAYAT ----------
const listRiwayat = document.getElementById("listRiwayat");
const filterLantai = document.getElementById("filterLantai");
const filterShift = document.getElementById("filterShift");
let riwayatCache = [];

async function loadRiwayat() {
  listRiwayat.innerHTML = '<div class="loading-state">Memuat data...</div>';
  try {
    const today = new Date().toISOString().slice(0, 10);
    const q = query(
      collection(db, "rhSuhu"),
      where("tanggal", "==", today),
      orderBy("timestamp", "desc")
    );
    const snap = await getDocs(q);
    riwayatCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderRiwayat();
  } catch (err) {
    listRiwayat.innerHTML = `<div class="empty-state"><i class="bi bi-exclamation-triangle"></i><p>Gagal memuat: ${err.message}</p></div>`;
  }
}

function renderRiwayat() {
  const lf = filterLantai.value;
  const sf = filterShift.value;

  let data = riwayatCache;
  if (lf) data = data.filter(r => r.lantaiId === lf);
  if (sf) data = data.filter(r => r.shift === sf);

  if (!data.length) {
    listRiwayat.innerHTML = '<div class="empty-state"><i class="bi bi-inbox"></i><p>Belum ada data untuk filter ini.</p></div>';
    return;
  }

  listRiwayat.innerHTML = data.map(r => {
    const tgl = r.timestamp?.toDate?.();
    const jamStr = tgl
      ? tgl.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })
      : "-";
    return `
      <div class="history-item">
        <img class="h-thumb" src="${r.fotoUrl}" alt="Foto" onclick="showDetail('${r.id}')" style="cursor:pointer;" />
        <div class="h-body">
          <p class="h-title">${escapeHtml(r.lantaiNama)} · Shift ${r.shift}</p>
          <p class="h-sub">${jamStr} · ${escapeHtml(r.petugasNama)}</p>
        </div>
        <div class="h-values">
          <strong>${r.suhu}°C</strong>
          <span>RH ${r.rh}%</span>
        </div>
      </div>
    `;
  }).join("");
}

window.showDetail = (id) => {
  const r = riwayatCache.find(x => x.id === id);
  if (!r) return;
  const tgl = r.timestamp?.toDate?.();
  const waktuStr = tgl ? tgl.toLocaleString("id-ID") : "-";
  document.getElementById("modalDetailBody").innerHTML = `
    <img src="${r.fotoUrl}" style="width:100%;border-radius:10px;margin-bottom:1rem;" />
    <table class="table table-sm mb-0">
      <tr><td class="text-muted">Lantai</td><td class="fw-semibold">${escapeHtml(r.lantaiNama)}</td></tr>
      <tr><td class="text-muted">Shift</td><td class="fw-semibold">Shift ${r.shift}</td></tr>
      <tr><td class="text-muted">Suhu</td><td class="fw-semibold">${r.suhu} °C</td></tr>
      <tr><td class="text-muted">RH</td><td class="fw-semibold">${r.rh} %</td></tr>
      <tr><td class="text-muted">Petugas</td><td class="fw-semibold">${escapeHtml(r.petugasNama)}</td></tr>
      <tr><td class="text-muted">Waktu</td><td class="fw-semibold">${waktuStr}</td></tr>
      ${r.catatan ? `<tr><td class="text-muted">Catatan</td><td>${escapeHtml(r.catatan)}</td></tr>` : ""}
    </table>
  `;
  new bootstrap.Modal("#modalDetail").show();
};

filterLantai.addEventListener("change", renderRiwayat);
filterShift.addEventListener("change", renderRiwayat);
document.getElementById("btnRefresh").addEventListener("click", loadRiwayat);

// ---------- UTIL ----------
function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// ---------- INIT ----------
loadRiwayat();