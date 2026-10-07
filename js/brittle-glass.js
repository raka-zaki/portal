import { db, storage } from "./firebase-config.js";
import { protectPage, logout,highlightSidebar } from "./guard.js";
import {
  collection, addDoc, getDocs, query, where, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  ref, uploadBytes, getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

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
let items = [];
let currentLineId = "";
let currentArea = "";
let currentLine = null;

// ---------- LOAD LINE ----------
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
}

document.getElementById("inputLine").addEventListener("change", (e) => {
  currentLineId = e.target.value;
  currentLine = lineCache.find(l => l.id === currentLineId);
  const sel = document.getElementById("inputArea");
  const areas = currentLine?.areas || ["Mixing"];
  if (!currentLineId) {
    sel.innerHTML = '<option value="">-- Pilih Line Dulu --</option>';
    sel.disabled = true;
    resetList();
    return;
  }
  sel.innerHTML = '<option value="">-- Pilih Area --</option>' +
    areas.map(a => `<option value="${a}">${a}</option>`).join("");
  sel.disabled = false;
  resetList();
});

document.getElementById("inputArea").addEventListener("change", async (e) => {
  currentArea = e.target.value;
  if (currentArea) await loadItems(currentLineId, currentArea);
  else resetList();
});

function resetList() {
  items = [];
  document.getElementById("listBrittle").innerHTML =
    '<div class="loading-state">Pilih line & area dulu...</div>';
  updateProgress();
}

await loadLine();

// ---------- LOAD ITEMS ----------
async function loadItems(lineId, area) {
  const box = document.getElementById("listBrittle");
  box.innerHTML = '<div class="loading-state">Memuat item...</div>';
  try {
    const q = query(
      collection(db, "brittleItems"),
      where("lineId", "==", lineId),
      where("area", "==", area),
      where("aktif", "==", true),
      orderBy("urutan", "asc")
    );
    const snap = await getDocs(q);
    items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderItems();
  } catch (err) {
    const all = await getDocs(collection(db, "brittleItems"));
    items = all.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(i => i.lineId === lineId && i.area === area && i.aktif !== false)
      .sort((a, b) => (a.urutan || 0) - (b.urutan || 0));
    renderItems();
  }
}

function renderItems() {
  const box = document.getElementById("listBrittle");
  if (!items.length) {
    box.innerHTML = '<div class="empty-state"><i class="bi bi-search"></i><p>Belum ada item untuk line & area ini.<br>Hubungi Super Admin.</p></div>';
    updateProgress();
    return;
  }

  // Group by lantaiNama
  const grouped = {};
  items.forEach(it => {
    const lantai = it.lantaiNama || "(Tanpa Lantai)";
    if (!grouped[lantai]) grouped[lantai] = [];
    grouped[lantai].push(it);
  });

  const html = Object.entries(grouped).map(([lantaiNama, list]) => `
    <div class="lantai-group">
      <div class="lantai-header">
        <i class="bi bi-geo-alt-fill"></i> ${escapeHtml(lantaiNama)}
        <span style="font-weight:400;font-size:0.75rem;color:#64748b;margin-left:auto;">
          ${list.length} item
        </span>
      </div>
      ${list.map(it => `
        <div class="brittle-row" data-item-id="${it.id}">
          <div class="info">
            <p class="posisi">${escapeHtml(it.posisi)}</p>
            <p class="meta">Jenis ${escapeHtml(it.jenis)} · Total ${it.total}</p>
            <input type="text" class="form-control form-control-sm mt-2 ket-input" 
                   data-item-id="${it.id}" placeholder="Keterangan (wajib kalau NOK)" 
                   style="display:none;" />
            <input type="file" class="form-control form-control-sm mt-2 foto-input" 
                   data-item-id="${it.id}" accept="image/*" capture="environment"
                   style="display:none;" />
          </div>
          <div class="status-group" data-item-id="${it.id}">
            <button type="button" class="status-btn ok active" data-status="OK">OK</button>
            <button type="button" class="status-btn nok" data-status="NOK">NOK</button>
          </div>
        </div>
      `).join("")}
    </div>
  `).join("");

  box.innerHTML = html;

  box.querySelectorAll(".status-group").forEach(group => {
    group.querySelectorAll(".status-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        group.querySelectorAll(".status-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        const itemId = group.dataset.itemId;
        const status = btn.dataset.status;
        const row = box.querySelector(`.brittle-row[data-item-id="${itemId}"]`);
        const ketInput = row.querySelector(".ket-input");
        const fotoInput = row.querySelector(".foto-input");
        if (status === "NOK") {
          row.classList.add("nok");
          ketInput.style.display = "block";
          fotoInput.style.display = "block";
        } else {
          row.classList.remove("nok");
          ketInput.style.display = "none";
          fotoInput.style.display = "none";
          ketInput.value = "";
          fotoInput.value = "";
        }
        updateProgress();
      });
    });
  });
  updateProgress();
}

function updateProgress() {
  let ok = 0, nok = 0;
  items.forEach(it => {
    const group = document.querySelector(`.status-group[data-item-id="${it.id}"]`);
    const active = group?.querySelector(".status-btn.active");
    if (active?.dataset.status === "OK") ok++;
    if (active?.dataset.status === "NOK") nok++;
  });
  document.getElementById("progressOk").textContent = ok;
  document.getElementById("progressNok").textContent = nok;
  document.getElementById("progressTotal").textContent = items.length;
  document.getElementById("btnSubmit").disabled = items.length === 0;
}

// ---------- SUBMIT ----------
document.getElementById("btnSubmit").addEventListener("click", async () => {
  if (!currentLineId) return alert("Pilih line dulu");
  if (!currentArea) return alert("Pilih area dulu");
  const shift = document.getElementById("inputShift").value;

  const itemData = [];
  for (const it of items) {
    const group = document.querySelector(`.status-group[data-item-id="${it.id}"]`);
    const active = group?.querySelector(".status-btn.active");
    const status = active?.dataset.status || "OK";
    const row = document.querySelector(`.brittle-row[data-item-id="${it.id}"]`);
    const ket = row.querySelector(".ket-input")?.value.trim() || "";
    const fileInput = row.querySelector(".foto-input");
    const file = fileInput?.files?.[0] || null;

    if (status === "NOK") {
      if (!ket) return alert(`Keterangan wajib diisi untuk NOK:\n"${it.posisi}"`);
      if (!file) return alert(`Foto wajib diupload untuk NOK:\n"${it.posisi}"`);
    }
    itemData.push({ item: it, status, ket, file });
  }

  const btn = document.getElementById("btnSubmit");
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Menyimpan...';

  try {
    // Upload foto dulu (kalau ada)
    const uploaded = [];
    for (const d of itemData) {
      let fotoUrl = null;
      if (d.file) {
        const ts = Date.now();
        const path = `brittle/${currentLineId}/${currentArea}/${d.item.id}_${ts}_${d.file.name}`;
        const storageRef = ref(storage, path);
        await uploadBytes(storageRef, d.file);
        fotoUrl = await getDownloadURL(storageRef);
      }
      uploaded.push({
        itemId: d.item.id,
        posisi: d.item.posisi,
        lantaiNama: d.item.lantaiNama || "",
        jenis: d.item.jenis,
        total: d.item.total,
        status: d.status,
        keterangan: d.ket,
        fotoUrl
      });
    }

    await addDoc(collection(db, "brittleSubmissions"), {
      lineId: currentLineId,
      lineNama: currentLine?.nama || "-",
      area: currentArea,
      shift,
      items: uploaded,
      petugasId: user.uid,
      petugasNama: user.nama || user.email,
      timestamp: serverTimestamp(),
      tanggal: new Date().toISOString().slice(0, 10),
    });

    // Reset
    document.getElementById("inputLine").value = "";
    document.getElementById("inputArea").innerHTML = '<option value="">-- Pilih Line Dulu --</option>';
    document.getElementById("inputArea").disabled = true;
    document.getElementById("inputShift").value = shiftAktif;
    resetList();
    currentLineId = ""; currentArea = ""; currentLine = null;

    loadRiwayat();
    alert("Brittle Glass berhasil disimpan ✅");
  } catch (err) {
    alert("Gagal simpan: " + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-send"></i> Simpan';
  }
});

// ---------- RIWAYAT ----------
const listRiwayat = document.getElementById("listRiwayat");
let riwayatCache = [];

async function loadRiwayat() {
  listRiwayat.innerHTML = '<div class="loading-state">Memuat data...</div>';
  try {
    const today = new Date().toISOString().slice(0, 10);
    const q = query(collection(db, "brittleSubmissions"), where("tanggal", "==", today));
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
  if (!riwayatCache.length) {
    listRiwayat.innerHTML = '<div class="empty-state"><i class="bi bi-inbox"></i><p>Belum ada input hari ini.</p></div>';
    return;
  }
  listRiwayat.innerHTML = riwayatCache.map(r => {
    const tgl = r.timestamp?.toDate?.();
    const jamStr = tgl ? tgl.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "-";
    const total = r.items?.length || 0;
    const ok = r.items?.filter(i => i.status === "OK").length || 0;
    const nok = r.items?.filter(i => i.status === "NOK").length || 0;
    return `
      <div class="cl-history-item" onclick="showDetail('${r.id}')">
        <div class="cl-head">
          <p class="cl-title">${escapeHtml(r.lineNama)} · ${escapeHtml(r.area)}</p>
          <i class="bi bi-chevron-right text-muted"></i>
        </div>
        <p class="cl-sub">Shift ${r.shift} · ${jamStr} · ${escapeHtml(r.petugasNama)}</p>
        <div class="cl-stats">
          <span class="text-success"><i class="bi bi-check-circle-fill"></i> ${ok}</span> · 
          <span class="text-danger"><i class="bi bi-x-circle-fill"></i> ${nok}</span> · 
          Total ${total}
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
  const itemsHtml = (r.items || []).map(i => `
    <tr>
      <td>
        <div class="small text-muted">${escapeHtml(i.lantaiNama || "")}</div>
        ${escapeHtml(i.posisi)}
        <div class="small text-muted">Jenis ${escapeHtml(i.jenis)} · Total ${i.total}</div>
        ${i.keterangan ? `<div class="small text-danger">${escapeHtml(i.keterangan)}</div>` : ""}
      </td>
      <td style="width:70px;">
        ${i.status === "OK" ? '<span class="badge bg-success">OK</span>' : '<span class="badge bg-danger">NOK</span>'}
        ${i.fotoUrl ? `<div class="mt-1"><a href="${i.fotoUrl}" target="_blank"><i class="bi bi-image"></i> Foto</a></div>` : ""}
      </td>
    </tr>
  `).join("");
  document.getElementById("modalDetailBody").innerHTML = `
    <div class="mb-3">
      <div class="fw-bold">${escapeHtml(r.lineNama)} · ${escapeHtml(r.area)}</div>
      <div class="text-muted small">Shift ${r.shift} · ${waktuStr} · ${escapeHtml(r.petugasNama)}</div>
    </div>
    <table class="table table-sm mb-0">
      <thead><tr><th>Posisi</th><th>Status</th></tr></thead>
      <tbody>${itemsHtml}</tbody>
    </table>
  `;
  new bootstrap.Modal("#modalDetail").show();
};

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