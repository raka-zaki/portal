import { db } from "./firebase-config.js";
import { protectPage, logout } from "./guard.js";
import {
  collection, getDocs, query, orderBy, where, deleteDoc, doc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

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

// ---------- KONSTANTA ----------
const KATEGORI_LABEL = { area: "Area", mesin: "Mesin", alat: "Alat" };
const KATEGORI_COLOR = {
  area: "bg-primary",
  mesin: "bg-warning text-dark",
  alat: "bg-success",
};

// ---------- STATE ----------
let allData = [];
let filteredData = [];
let currentTab = "all";
let lineCache = [];
let lantaiCache = [];

// ---------- CEK BOLEH EDIT/HAPUS ----------
function bolehEdit(item) {
  if (user.role === "superadmin" || user.role === "supervisor") return true;
  return item.petugasId === user.uid;
}

// ---------- LOAD LINE ----------
async function loadLine() {
  const q = query(collection(db, "line"), orderBy("urutan", "asc"));
  const snap = await getDocs(q);
  lineCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  const opt = lineCache.map(l => `<option value="${l.id}">${escapeHtml(l.nama)}</option>`).join("");
  document.getElementById("filterLine").insertAdjacentHTML("beforeend", opt);
}

// ---------- LOAD SEMUA LANTAI ----------
async function loadLantaiAll() {
  const q = query(collection(db, "lantai"), orderBy("urutan", "asc"));
  const snap = await getDocs(q);
  lantaiCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

function refreshFilterLantai(lineId) {
  const sel = document.getElementById("filterLantai");
  const data = lineId ? lantaiCache.filter(l => l.lineId === lineId) : lantaiCache;
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
      getDocs(collection(db, "brittleSubmissions")),
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

// ---------- FILTER ----------
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
    const lokasi = `${escapeHtml(item.lineNama || "-")} · ${escapeHtml(item.lantaiNama || item.area || "-")}`;
    const canEdit = bolehEdit(item);

    let iconClass = "bi-clipboard";
    let iconBg = "#eff6ff";
    let iconColor = "#2563eb";
    let title = "";
    let rightHtml = "";

    if (item._tipe === "rh") {
      iconClass = "bi-thermometer-half";
      iconBg = "#fee2e2"; iconColor = "#b91c1c";
      title = `RH & Suhu · ${lokasi}`;
      rightHtml = `<strong>${item.suhu}°C</strong><span>RH ${item.rh}%</span>`;
    } else if (item._tipe === "brittle") {
      const total = item.items?.length || 0;
      const nok = item.items?.filter(i => i.status === "NOK").length || 0;
      iconClass = "bi-search";
      iconBg = "#fef3c7"; iconColor = "#b45309";
      title = `Brittle Glass · ${escapeHtml(item.lineNama)} · ${escapeHtml(item.area)}`;
      rightHtml = `<strong>${total - nok}/${total}</strong><span>${nok > 0 ? nok + " NOK" : "OK"}</span>`;
    } else {
      const total = item.items?.length || 0;
      const ok = item.items?.filter(i => i.status === "OK").length || 0;
      const nok = item.items?.filter(i => i.status === "NOK").length || 0;
      const kat = item.kategori || "area";
      iconClass = "bi-check2-square";
      iconBg = kat === "mesin" ? "#fef3c7" : kat === "alat" ? "#dcfce7" : "#eff6ff";
      iconColor = kat === "mesin" ? "#b45309" : kat === "alat" ? "#15803d" : "#2563eb";
      title = `Checklist ${KATEGORI_LABEL[kat]} · ${lokasi}`;
      rightHtml = `<strong>${ok}/${total}</strong><span>${nok > 0 ? nok + " NOK" : "OK"}</span>`;
    }

    return `
      <div class="riwayat-item" data-tipe="${item._tipe}">
        <div class="ri-icon" style="background:${iconBg};color:${iconColor};">
          <i class="bi ${iconClass}"></i>
        </div>
        <div class="ri-body" onclick="showDetail('${item._id}','${item._tipe}')" style="cursor:pointer;">
          <p class="ri-title">${title}</p>
          <p class="ri-sub">${waktu} · Shift ${item.shift} · ${escapeHtml(item.petugasNama || "-")}</p>
        </div>
        <div class="ri-right" onclick="showDetail('${item._id}','${item._tipe}')" style="cursor:pointer;">
          ${rightHtml}
        </div>
        ${canEdit ? `
          <div class="ri-actions">
            <button class="btn-action danger" onclick="hapusData('${item._id}','${item._tipe}')" title="Hapus">
              <i class="bi bi-trash"></i>
            </button>
          </div>
        ` : ""}
      </div>
    `;
  }).join("");

  if (filteredData.length > 100) {
    box.insertAdjacentHTML("beforeend",
      `<div class="text-center text-muted small py-3">Menampilkan 100 data pertama dari ${filteredData.length}</div>`);
  }
}

// ---------- HAPUS DATA ----------
window.hapusData = async (id, tipe) => {
  const item = allData.find(x => x._id === id && x._tipe === tipe);
  if (!item) return;
  if (!bolehEdit(item)) return alert("Kamu tidak punya akses untuk hapus ini.");

  const label = item._tipe === "rh" ? "RH & Suhu"
              : item._tipe === "brittle" ? "Brittle Glass"
              : "Checklist";

  if (!confirm(`Hapus data ${label} untuk ${item.lineNama} · ${item.lantaiNama || item.area}?\n\nData yang dihapus tidak bisa dikembalikan.`)) return;

  const collMap = {
    rh: "rhSuhu",
    brittle: "brittleSubmissions",
    checklist: "checklistSubmissions",
  };

  try {
    await deleteDoc(doc(db, collMap[tipe], id));
    alert("Data berhasil dihapus.");
    loadAll();
  } catch (err) {
    alert("Gagal hapus: " + err.message);
  }
};

// ---------- DETAIL ----------
window.showDetail = (id, tipe) => {
  const item = allData.find(x => x._id === id && x._tipe === tipe);
  if (!item) return;
  const tgl = item.timestamp?.toDate?.();
  const waktuStr = tgl ? tgl.toLocaleString("id-ID") : "-";
  const lokasi = `${escapeHtml(item.lineNama || "-")} · ${escapeHtml(item.lantaiNama || item.area || "-")}`;

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
    const itemsHtml = (item.items || []).map(i => `
      <tr>
        <td>
          <div class="small text-muted">${escapeHtml(i.lantaiNama || "")}</div>
          ${escapeHtml(i.posisi)}
          <div class="small text-muted">Jenis ${escapeHtml(i.jenis)} · Total ${i.total}</div>
          ${i.keterangan ? `<div class="small text-danger">${escapeHtml(i.keterangan)}</div>` : ""}
        </td>
        <td style="width:70px;">
          ${i.status === "OK" ? '<span class="badge bg-success">OK</span>' : '<span class="badge bg-danger">NOK</span>'}
          ${i.fotoUrl ? `<div class="mt-1"><a href="${i.fotoUrl}" target="_blank"><i class="bi bi-image"></i></a></div>` : ""}
        </td>
      </tr>
    `).join("");
    body = `
      <div class="mb-3">
        <div class="fw-bold">${escapeHtml(item.lineNama)} · ${escapeHtml(item.area)}</div>
        <div class="text-muted small">Shift ${item.shift} · ${waktuStr} · ${escapeHtml(item.petugasNama)}</div>
      </div>
      <table class="table table-sm mb-0">
        <thead><tr><th>Posisi</th><th>Status</th></tr></thead>
        <tbody>${itemsHtml}</tbody>
      </table>`;
  } else {
    const kat = item.kategori || "area";
    const itemsHtml = (item.items || []).map(i => {
      const badge = i.status === "OK" ? '<span class="badge bg-success">✓</span>'
                  : i.status === "NOK" ? '<span class="badge bg-danger">✗</span>'
                  : '<span class="badge bg-secondary">—</span>';
      return `<tr>
        <td>
          ${escapeHtml(i.label)}
          ${i.keterangan ? `<div class="small text-muted">${escapeHtml(i.keterangan)}</div>` : ""}
          ${i.fotoUrl ? `<div class="mt-1"><a href="${i.fotoUrl}" target="_blank"><i class="bi bi-image"></i> Foto</a></div>` : ""}
        </td>
        <td style="width:60px;">${badge}</td>
      </tr>`;
    }).join("");
    body = `
      <div class="mb-3">
        <div class="fw-bold">
          <span class="badge ${KATEGORI_COLOR[kat] || 'bg-secondary'}">${KATEGORI_LABEL[kat] || kat}</span>
          ${escapeHtml(item.lineNama)} · ${escapeHtml(item.lantaiNama)}
        </div>
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
document.getElementById("filterLantai").addEventListener("change", applyFilter);

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
await loadAll();