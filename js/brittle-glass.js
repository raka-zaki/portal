import { db, storage } from "./firebase-config.js";
import { protectPage, logout } from "./guard.js";
import {
  collection, addDoc, getDocs, query, where, orderBy, serverTimestamp
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

const sidebar = document.getElementById("sidebar");
const overlay = document.getElementById("sidebarOverlay");
document.getElementById("btnMenu").addEventListener("click", () => {
  sidebar.classList.add("open"); overlay.classList.add("show");
});
overlay.addEventListener("click", () => {
  sidebar.classList.remove("open"); overlay.classList.remove("show");
});
if (user.role === "superadmin") {
  document.getElementById("adminLabel").style.display = "block";
  document.getElementById("adminNav").style.display = "block";
}
document.getElementById("btnLogout").addEventListener("click", logout);

// ---------- SHIFT AUTO ----------
const now = new Date();
const jam = now.getHours();
let shiftAktif = "1";
if (jam >= 15 && jam < 23) shiftAktif = "2";
else if (jam >= 23 || jam < 7) shiftAktif = "3";
document.getElementById("shiftAktif").textContent = shiftAktif;
document.getElementById("inputShift").value = shiftAktif;

// ---------- CACHE ----------
let lineCache = [];
let lantaiCache = [];

async function loadLine() {
  const q = query(collection(db, "line"), orderBy("urutan", "asc"));
  const snap = await getDocs(q);
  lineCache = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(l => l.aktif !== false);

  const opt = lineCache
    .map(l => `<option value="${l.id}">${escapeHtml(l.nama)}</option>`)
    .join("");
  document.getElementById("inputLine").insertAdjacentHTML("beforeend", opt);
  document.getElementById("filterLine").insertAdjacentHTML("beforeend", opt);
}

async function loadLantaiAll() {
  const q = query(collection(db, "lantai"), orderBy("urutan", "asc"));
  const snap = await getDocs(q);
  lantaiCache = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(l => l.aktif !== false);
}

function refreshLantaiByLine(lineId, selectEl, placeholder) {
  const data = lineId ? lantaiCache.filter(l => l.lineId === lineId) : [];
  if (!data.length) {
    selectEl.innerHTML = `<option value="">${placeholder}</option>`;
    selectEl.disabled = true;
    return;
  }
  selectEl.innerHTML =
    `<option value="">-- Pilih Lantai --</option>` +
    data.map(l => `<option value="${l.id}">${escapeHtml(l.nama)}</option>`).join("");
  selectEl.disabled = false;
}

document.getElementById("inputLine").addEventListener("change", (e) => {
  refreshLantaiByLine(e.target.value, document.getElementById("inputLantai"), "-- Pilih Line Dulu --");
});

document.getElementById("filterLine").addEventListener("change", (e) => {
  refreshLantaiByLine(e.target.value, document.getElementById("filterLantai"), "Semua Lantai");
  renderRiwayat();
});

await loadLine();
await loadLantaiAll();

// ---------- KONDISI TOGGLE ----------
const radios = document.querySelectorAll('input[name="kondisi"]');
const wrapFoto = document.getElementById("wrapFoto");
radios.forEach(r => r.addEventListener("change", () => {
  wrapFoto.style.display = r.value === "rusak" && r.checked ? "block" : "none";
  if (r.value === "aman" && r.checked) {
    fotoFile = null;
    fotoInput.value = "";
    fotoImg.src = "";
    fotoDrop.style.display = "block";
    fotoPreview.style.display = "none";
  }
}));

// ---------- FOTO ----------
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
const form = document.getElementById("formBG");
const btnSubmit = document.getElementById("btnSubmit");

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const lineId = document.getElementById("inputLine").value;
  const lantaiId = document.getElementById("inputLantai").value;
  const shift = document.getElementById("inputShift").value;
  const kondisi = document.querySelector('input[name="kondisi"]:checked').value;
  const keterangan = document.getElementById("inputKeterangan").value.trim();

  if (!lineId) return alert("Pilih line dulu");
  if (!lantaiId) return alert("Pilih lantai dulu");
  if (kondisi === "rusak" && !fotoFile) return alert("Foto wajib diupload kalau kondisi rusak");

  btnSubmit.disabled = true;
  btnSubmit.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Menyimpan...';

  try {
    let fotoUrl = null;
    if (kondisi === "rusak" && fotoFile) {
      const timestamp = Date.now();
      const path = `brittle-glass/${lantaiId}/${timestamp}_${fotoFile.name}`;
      const storageRef = ref(storage, path);
      await uploadBytes(storageRef, fotoFile);
      fotoUrl = await getDownloadURL(storageRef);
    }

    const line = lineCache.find(l => l.id === lineId);
    const lantai = lantaiCache.find(l => l.id === lantaiId);

    await addDoc(collection(db, "brittleGlass"), {
      lineId,
      lineNama: line?.nama || "-",
      lantaiId,
      lantaiNama: lantai?.nama || "-",
      shift,
      kondisi,
      fotoUrl,
      keterangan,
      petugasId: user.uid,
      petugasNama: user.nama || user.email,
      timestamp: serverTimestamp(),
      tanggal: new Date().toISOString().slice(0, 10),
    });

    form.reset();
    document.getElementById("inputShift").value = shiftAktif;
    document.getElementById("kondisiAman").checked = true;
    wrapFoto.style.display = "none";
    document.getElementById("inputLantai").innerHTML = '<option value="">-- Pilih Line Dulu --</option>';
    document.getElementById("inputLantai").disabled = true;
    fotoFile = null;
    fotoImg.src = "";
    fotoDrop.style.display = "block";
    fotoPreview.style.display = "none";

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
const filterKondisi = document.getElementById("filterKondisi");
let riwayatCache = [];

async function loadRiwayat() {
  listRiwayat.innerHTML = '<div class="loading-state">Memuat data...</div>';
  try {
    const today = new Date().toISOString().slice(0, 10);
    const q = query(collection(db, "brittleGlass"), where("tanggal", "==", today));
    const snap = await getDocs(q);
    riwayatCache = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
    renderRiwayat();
  } catch (err) {
    listRiwayat.innerHTML = `<div class="empty-state"><i class="bi bi-exclamation-triangle"></i><p>Gagal memuat: ${err.message}</p></div>`;
  }
}

function renderRiwayat() {
  const lf = filterLantai.value;
  const kf = filterKondisi.value;

  let data = riwayatCache;
  if (lf) data = data.filter(r => r.lantaiId === lf);
  if (kf) data = data.filter(r => r.kondisi === kf);

  if (!data.length) {
    listRiwayat.innerHTML = '<div class="empty-state"><i class="bi bi-inbox"></i><p>Belum ada data untuk filter ini.</p></div>';
    return;
  }

  listRiwayat.innerHTML = data.map(r => {
    const tgl = r.timestamp?.toDate?.();
    const jamStr = tgl
      ? tgl.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })
      : "-";
    const thumb = r.fotoUrl
      ? `<img class="h-thumb" src="${r.fotoUrl}" onclick="showDetail('${r.id}')" style="cursor:pointer;" />`
      : `<div class="h-thumb d-flex align-items-center justify-content-center bg-light text-success"><i class="bi bi-check2-circle" style="font-size:1.4rem;"></i></div>`;
    return `
      <div class="history-item">
        ${thumb}
        <div class="h-body">
          <p class="h-title">${escapeHtml(r.lineNama || "-")} · ${escapeHtml(r.lantaiNama || "-")}</p>
          <p class="h-sub">Shift ${r.shift} · ${jamStr} · ${escapeHtml(r.petugasNama)}</p>
        </div>
        <div class="h-values">
          <span class="kondisi-badge ${r.kondisi}">${r.kondisi}</span>
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
    ${r.fotoUrl ? `<img src="${r.fotoUrl}" style="width:100%;border-radius:10px;margin-bottom:1rem;" />` : ""}
    <table class="table table-sm mb-0">
      <tr><td class="text-muted">Line</td><td class="fw-semibold">${escapeHtml(r.lineNama || "-")}</td></tr>
      <tr><td class="text-muted">Lantai</td><td class="fw-semibold">${escapeHtml(r.lantaiNama || "-")}</td></tr>
      <tr><td class="text-muted">Shift</td><td class="fw-semibold">Shift ${r.shift}</td></tr>
      <tr><td class="text-muted">Kondisi</td><td><span class="kondisi-badge ${r.kondisi}">${r.kondisi}</span></td></tr>
      <tr><td class="text-muted">Petugas</td><td class="fw-semibold">${escapeHtml(r.petugasNama)}</td></tr>
      <tr><td class="text-muted">Waktu</td><td class="fw-semibold">${waktuStr}</td></tr>
      ${r.keterangan ? `<tr><td class="text-muted">Keterangan</td><td>${escapeHtml(r.keterangan)}</td></tr>` : ""}
    </table>
  `;
  new bootstrap.Modal("#modalDetail").show();
};

filterLantai.addEventListener("change", renderRiwayat);
filterKondisi.addEventListener("change", renderRiwayat);
document.getElementById("btnRefresh").addEventListener("click", loadRiwayat);

function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

loadRiwayat();