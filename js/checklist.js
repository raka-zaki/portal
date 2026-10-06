import { db } from "./firebase-config.js";
import { protectPage, logout,highlightSidebar } from "./guard.js";
import {
  collection, getDocs, query, orderBy, where
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

highlightSidebar();
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

// ---------- STATE ----------
let allData = [];        // gabungan semua
let filteredData = [];
let currentTab = "all";
let lantaiList = [];

// ---------- LOAD LANTAI ----------
async function loadLantai() {
  try {
    const q = query(collection(db, "lantai"), orderBy("urutan", "asc"));
    const snap = await getDocs(q);
    lantaiList = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const opt = lantaiList.map(l => `<option value="${l.id}">${l.nama}</option>`).join("");
    document.getElementById("filterLantai").insertAdjacentHTML("beforeend", opt);
  } catch (e) {}
}

// ---------- LOAD ALL DATA ----------
async function loadAll() {
  const box = document.getElementById("listRiwayat");
  box.innerHTML = '<div class="loading-state">Memuat data...</div>';

  try {
    const [rhSnap, bgSnap, clSnap] = await Promise.all([
      getDocs(collection(db, "rhSuhu")),
      getDocs(collection(db, "brittleGlass")),
      getDocs(collection(db, "checklistSubmissions")),
    ]);

    const rhData = rhSnap.docs.map(d => ({
      _id: d.id, _tipe: "rh", ...d.data()
    }));
    const bgData = bgSnap.docs.map(d => ({
      _id: d.id, _tipe: "brittle", ...d.data()
    }));
    const clData = clSnap.docs.map(d => ({
      _id: d.id, _tipe: "checklist", ...d.data()
    }));

    allData = [...rhData, ...bgData, ...clData]
      .sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));

    // Summary
    document.getElementById("sumRH").textContent = rhData.length;
    document.getElementById("sumBG").textContent = bgData.length;
    document.getElementById("sumCL").textContent = clData.length;
    document.getElementById("sumTotal").textContent = allData.length;

    applyFilter();
  } catch (err) {
    box.innerHTML = `<div class="empty-state"><i class="bi bi-exclamation-triangle"></i><p>Gagal memuat: ${err.message}</p></div>`;
  }
}

// ---------- FILTER ----------
function applyFilter() {
  const lf = document.getElementById("filterLantai").value;
  const sf = document.getElementById("filterShift").value;
  const df = document.getElementById("filterDari").value;
  const ds = document.getElementById("filterSampai").value;

  filteredData = allData.filter(item => {
    if (currentTab !== "all" && item._tipe !== currentTab) return false;
    if (lf && item.lantaiId !== lf) return false;
    if (sf && item.shift !== sf) return false;
    if (df && item.tanggal && item.tanggal < df) return false;
    if (ds && item.tanggal && item.tanggal > ds) return false;
    return true;
  });

  renderList();
}

// ---------- RENDER LIST ----------
function renderList() {
  const box = document.getElementById("listRiwayat");

  if (!filteredData.length) {
    box.innerHTML = '<div class="empty-state"><i class="bi bi-inbox"></i><p>Belum ada data untuk filter ini.</p></div>';
    return;
  }

  box.innerHTML = filteredData.slice(0, 100).map(item => {
    const tgl = item.timestamp?.toDate?.();
    const waktu = tgl
      ? tgl.toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
      : "-";

    if (item._tipe === "rh") {
      return `
        <div class="riwayat-item" onclick="showDetail('${item._id}','rh')">
          <img class="ri-thumb" src="${item.fotoUrl}" alt="" />
          <div class="ri-body">
            <p class="ri-title">RH & Suhu · ${escapeHtml(item.lantaiNama || "-")}</p>
            <p class="ri-sub">${waktu} · Shift ${item.shift} · ${escapeHtml(item.petugasNama || "-")}</p>
          </div>
          <div class="ri-right">
            <strong>${item.suhu}°C</strong>
            RH ${item.rh}%
          </div>
        </div>
      `;
    }

    if (item._tipe === "brittle") {
      const thumb = item.fotoUrl
        ? `<img class="ri-thumb" src="${item.fotoUrl}" alt="" />`
        : `<div class="ri-icon brittle"><i class="bi bi-shield-check"></i></div>`;
      return `
        <div class="riwayat-item" onclick="showDetail('${item._id}','brittle')">
          ${thumb}
          <div class="ri-body">
            <p class="ri-title">Brittle Glass · ${escapeHtml(item.lantaiNama || "-")}</p>
            <p class="ri-sub">${waktu} · Shift ${item.shift} · ${escapeHtml(item.petugasNama || "-")}</p>
          </div>
          <div class="ri-right">
            <strong style="color:${item.kondisi === 'rusak' ? '#b91c1c' : '#15803d'};">
              ${item.kondisi}
            </strong>
          </div>
        </div>
      `;
    }

    // checklist
    const total = item.items?.length || 0;
    const terisi = item.items?.filter(i =>
      i.tipe === "text" ? (i.nilai || "").trim() !== "" : i.nilai === true
    ).length || 0;
    return `
      <div class="riwayat-item" onclick="showDetail('${item._id}','checklist')">
        <div class="ri-icon checklist"><i class="bi bi-check2-square"></i></div>
        <div class="ri-body">
          <p class="ri-title">Checklist ${item.kategori === "alat" ? "Alat" : "Kebersihan"} · ${escapeHtml(item.lantaiNama || "-")}</p>
          <p class="ri-sub">${waktu} · Shift ${item.shift} · ${escapeHtml(item.petugasNama || "-")}</p>
        </div>
        <div class="ri-right">
          <strong>${terisi}/${total}</strong>
          item
        </div>
      </div>
    `;
  }).join("");

  if (filteredData.length > 100) {
    box.insertAdjacentHTML("beforeend",
      `<div class="text-center text-muted small py-3">Menampilkan 100 data pertama dari ${filteredData.length}</div>`);
  }
}

// ---------- DETAIL ----------
window.showDetail = (id, tipe) => {
  const item = allData.find(x => x._id === id && x._tipe === tipe);
  if (!item) return;
  const tgl = item.timestamp?.toDate?.();
  const waktuStr = tgl ? tgl.toLocaleString("id-ID") : "-";

  let body = "";

  if (tipe === "rh") {
    body = `
      <img src="${item.fotoUrl}" style="width:100%;border-radius:10px;margin-bottom:1rem;" />
      <table class="table table-sm mb-0">
        <tr><td class="text-muted">Lantai</td><td class="fw-semibold">${escapeHtml(item.lantaiNama)}</td></tr>
        <tr><td class="text-muted">Shift</td><td>Shift ${item.shift}</td></tr>
        <tr><td class="text-muted">Suhu</td><td class="fw-semibold">${item.suhu} °C</td></tr>
        <tr><td class="text-muted">RH</td><td class="fw-semibold">${item.rh} %</td></tr>
        <tr><td class="text-muted">Petugas</td><td>${escapeHtml(item.petugasNama)}</td></tr>
        <tr><td class="text-muted">Waktu</td><td>${waktuStr}</td></tr>
        ${item.catatan ? `<tr><td class="text-muted">Catatan</td><td>${escapeHtml(item.catatan)}</td></tr>` : ""}
      </table>`;
  } else if (tipe === "brittle") {
    body = `
      ${item.fotoUrl ? `<img src="${item.fotoUrl}" style="width:100%;border-radius:10px;margin-bottom:1rem;" />` : ""}
      <table class="table table-sm mb-0">
        <tr><td class="text-muted">Lantai</td><td class="fw-semibold">${escapeHtml(item.lantaiNama)}</td></tr>
        <tr><td class="text-muted">Shift</td><td>Shift ${item.shift}</td></tr>
        <tr><td class="text-muted">Kondisi</td><td class="fw-semibold" style="color:${item.kondisi === 'rusak' ? '#b91c1c' : '#15803d'};">${item.kondisi}</td></tr>
        <tr><td class="text-muted">Petugas</td><td>${escapeHtml(item.petugasNama)}</td></tr>
        <tr><td class="text-muted">Waktu</td><td>${waktuStr}</td></tr>
        ${item.keterangan ? `<tr><td class="text-muted">Keterangan</td><td>${escapeHtml(item.keterangan)}</td></tr>` : ""}
      </table>`;
  } else {
    const itemsHtml = (item.items || []).map(i => {
      if (i.tipe === "text") {
        return `<tr><td style="width:60%;">${escapeHtml(i.label)}</td><td>${i.nilai ? `<span class="fw-semibold">${escapeHtml(i.nilai)}</span>` : '<span class="text-muted">—</span>'}</td></tr>`;
      }
      return `<tr><td>${escapeHtml(i.label)}</td><td>${i.nilai ? '<i class="bi bi-check-circle-fill text-success"></i>' : '<i class="bi bi-x-circle text-muted"></i>'}</td></tr>`;
    }).join("");
    body = `
      <div class="mb-3">
        <div class="fw-bold">${escapeHtml(item.lantaiNama)} · Shift ${item.shift}</div>
        <div class="text-muted small">${waktuStr} · ${escapeHtml(item.petugasNama)}</div>
      </div>
      <table class="table table-sm mb-0">
        <thead><tr><th>Item</th><th>Status</th></tr></thead>
        <tbody>${itemsHtml}</tbody>
      </table>`;
  }

  document.getElementById("modalDetailBody").innerHTML = body;
  new bootstrap.Modal("#modalDetail").show();
};

// ---------- TABS ----------
document.querySelectorAll(".riwayat-tabs button").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".riwayat-tabs button").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    currentTab = btn.dataset.tab;
    applyFilter();
  });
});

// ---------- FILTER EVENTS ----------
document.getElementById("btnFilter").addEventListener("click", applyFilter);
document.getElementById("filterShift").addEventListener("change", applyFilter);

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
await loadLantai();
await loadAll();