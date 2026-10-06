import { db } from "./firebase-config.js";
import { protectPage, logout,highlightSidebar } from "./guard.js";
import {
  collection, getDocs, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
highlightSidebar("riwayat");
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
let allData = [];
let filteredData = [];
let currentTab = "all";
let lineCache = [];
let lantaiCache = [];

// ---------- LOAD LINE & LANTAI ----------
async function loadLine() {
  const q = query(collection(db, "line"), orderBy("urutan", "asc"));
  const snap = await getDocs(q);
  lineCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  const opt = lineCache.map(l => `<option value="${l.id}">${escapeHtml(l.nama)}</option>`).join("");
  document.getElementById("filterLine").insertAdjacentHTML("beforeend", opt);
}

async function loadLantaiAll() {
  const q = query(collection(db, "lantai"), orderBy("urutan", "asc"));
  const snap = await getDocs(q);
  lantaiCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

function refreshFilterLantai(lineId) {
  const sel = document.getElementById("filterLantai");
  const data = lineId ? lantaiCache.filter(l => l.lineId === lineId) : [];
  if (!data.length) {
    sel.innerHTML = '<option value="">Semua Lantai</option>';
    return;
  }
  sel.innerHTML = '<option value="">Semua Lantai</option>' +
    data.map(l => `<option value="${l.id}">${escapeHtml(l.nama)}</option>`).join("");
}

document.getElementById("filterLine").addEventListener("change", (e) => {
  refreshFilterLantai(e.target.value);
  applyFilter();
});

await loadLine();
await loadLantaiAll();

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

    const rhData = rhSnap.docs.map(d => ({ _id: d.id, _tipe: "rh", ...d.data() }));
    const bgData = bgSnap.docs.map(d => ({ _id: d.id, _tipe: "brittle", ...d.data() }));
    const clData = clSnap.docs.map(d => ({ _id: d.id, _tipe: "checklist", ...d.data() }));

    allData = [...rhData, ...bgData, ...clData]
      .sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));

    document.getElementById("sumRH").textContent = rhData.length;
    document.getElementById("sumBG").textContent = bgData.length;
    document.getElementById("sumCL").textContent = clData.length;
    document.getElementById("sumTotal").textContent = allData.length;

    applyFilter();
  } catch (err) {
    box.innerHTML = `<div class="empty-state"><i class="bi bi-exclamation-triangle"></i><p>Gagal memuat: ${err.message}</p></div>`;
  }
}

function applyFilter() {
  const lf = document.getElementById("filterLine").value;
  const ltf = document.getElementById("filterLantai").value;
  const sf = document.getElementById("filterShift").value;
  const df = document.getElementById("filterDari").value;
  const ds = document.getElementById("filterSampai").value;

  filteredData = allData.filter(item => {
    if (currentTab !== "all" && item._tipe !== currentTab) return false;
    if (lf && item.lineId !== lf) return false;
    if (ltf && item.lantaiId !== ltf) return false;
    if (sf && item.shift !== sf) return false;
    if (df && item.tanggal && item.tanggal < df) return false;
    if (ds && item.tanggal && item.tanggal > ds) return false;
    return true;
  });

  renderList();
}

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
    const lokasi = `${escapeHtml(item.lineNama || "-")} · ${escapeHtml(item.lantaiNama || "-")}`;

    if (item._tipe === "rh") {
      return `
        <div class="riwayat-item" onclick="showDetail('${item._id}','rh')">
          <img class="ri-thumb" src="${item.fotoUrl}" alt="" />
          <div class="ri-body">
            <p class="ri-title">RH & Suhu · ${lokasi}</p>
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
            <p class="ri-title">Brittle Glass · ${lokasi}</p>
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

    const total = item.items?.length || 0;
    const terisi = item.items?.filter(i =>
      i.tipe === "text" ? (i.nilai || "").trim() !== "" : i.nilai === true
    ).length || 0;
    return `
      <div class="riwayat-item" onclick="showDetail('${item._id}','checklist')">
        <div class="ri-icon checklist"><i class="bi bi-check2-square"></i></div>
        <div class="ri-body">
          <p class="ri-title">Checklist ${item.kategori === "alat" ? "Alat" : "Kebersihan"} · ${lokasi}</p>
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

window.showDetail = (id, tipe) => {
  const item = allData.find(x => x._id === id && x._tipe === tipe);
  if (!item) return;
  const tgl = item.timestamp?.toDate?.();
  const waktuStr = tgl ? tgl.toLocaleString("id-ID") : "-";
  const lokasi = `${escapeHtml(item.lineNama || "-")} · ${escapeHtml(item.lantaiNama || "-")}`;

  let body = "";

  if (tipe === "rh") {
    body = `
      <img src="${item.fotoUrl}" style="width:100%;border-radius:10px;margin-bottom:1rem;" />
      <table class="table table-sm mb-0">
        <tr><td class="text-muted">Lokasi</td><td class="fw-semibold">${lokasi}</td></tr>
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
        <tr><td class="text-muted">Lokasi</td><td class="fw-semibold">${lokasi}</td></tr>
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
        <div class="fw-bold">${lokasi}</div>
        <div class="text-muted small">Shift ${item.shift} · ${waktuStr} · ${escapeHtml(item.petugasNama)}</div>
      </div>
      <table class="table table-sm mb-0">
        <thead><tr><th>Item</th><th>Status</th></tr></thead>
        <tbody>${itemsHtml}</tbody>
      </table>`;
  }

  document.getElementById("modalDetailBody").innerHTML = body;
  new bootstrap.Modal("#modalDetail").show();
};

document.querySelectorAll(".riwayat-tabs button").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".riwayat-tabs button").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    currentTab = btn.dataset.tab;
    applyFilter();
  });
});

document.getElementById("btnFilter").addEventListener("click", applyFilter);
document.getElementById("filterShift").addEventListener("change", applyFilter);
document.getElementById("filterLantai").addEventListener("change", applyFilter);

function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

await loadAll();