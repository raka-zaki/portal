import { db, auth } from "./firebase-config.js";
import { protectPage, logout } from "./guard.js";
import {
  collection, doc, addDoc, updateDoc, deleteDoc,
  getDocs, query, orderBy, where, serverTimestamp, setDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  createUserWithEmailAndPassword, signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const DOMAIN = "@produksi.local";

const user = await protectPage(["superadmin"]);
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
document.getElementById("btnLogout").addEventListener("click", logout);

// TABS
const tabs = document.querySelectorAll(".admin-tabs button");
const panels = {
  line:    document.getElementById("panel-line"),
  lantai:  document.getElementById("panel-lantai"),
  field:   document.getElementById("panel-field"),
  brittle: document.getElementById("panel-brittle"),
  user:    document.getElementById("panel-user"),
};
tabs.forEach(btn => {
  btn.addEventListener("click", () => {
    tabs.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    Object.values(panels).forEach(p => p.style.display = "none");
    panels[btn.dataset.tab].style.display = "block";
  });
});

const modalLine    = new bootstrap.Modal("#modalLine");
const modalLantai  = new bootstrap.Modal("#modalLantai");
const modalField   = new bootstrap.Modal("#modalField");
const modalBrittle = new bootstrap.Modal("#modalBrittle");
const modalUser    = new bootstrap.Modal("#modalUser");

// =========================================================
// ============== LINE =====================================
// =========================================================
let lineCache = [];

async function loadLine() {
  const box = document.getElementById("listLine");
  box.innerHTML = '<div class="loading-state">Memuat data...</div>';
  try {
    const q = query(collection(db, "line"), orderBy("urutan", "asc"));
    const snap = await getDocs(q);
    lineCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderLine();
    refreshLineDropdowns();
  } catch (err) {
    box.innerHTML = `<div class="empty-state"><i class="bi bi-exclamation-triangle"></i><p>Gagal memuat: ${err.message}</p></div>`;
  }
}

function renderLine() {
  const box = document.getElementById("listLine");
  if (!lineCache.length) {
    box.innerHTML = '<div class="empty-state"><i class="bi bi-diagram-3"></i><p>Belum ada line. Tambahkan dulu.</p></div>';
    return;
  }
  box.innerHTML = lineCache.map(l => `
    <div class="admin-item">
      <div class="item-icon"><i class="bi bi-diagram-3"></i></div>
      <div class="item-body">
        <p class="item-title">${escapeHtml(l.nama)}</p>
        <p class="item-sub">
          Area: ${(l.areas || ["Mixing"]).join(", ")} · 
          Urutan: ${l.urutan} · 
          <span class="badge-status ${l.aktif ? 'aktif' : 'nonaktif'}">${l.aktif ? 'Aktif' : 'Nonaktif'}</span>
        </p>
      </div>
      <div class="item-actions">
        <button class="btn-icon" onclick="editLine('${l.id}')"><i class="bi bi-pencil"></i></button>
        <button class="btn-icon danger" onclick="hapusLine('${l.id}')"><i class="bi bi-trash"></i></button>
      </div>
    </div>
  `).join("");
}

window.openLineModal = () => {
  document.getElementById("modalLineTitle").textContent = "Tambah Line";
  document.getElementById("lineId").value = "";
  document.getElementById("lineNama").value = "";
  document.getElementById("lineAreas").value = "";
  document.getElementById("lineUrutan").value = (lineCache.length + 1);
  document.getElementById("lineAktif").checked = true;
  modalLine.show();
};

window.editLine = (id) => {
  const l = lineCache.find(x => x.id === id);
  if (!l) return;
  document.getElementById("modalLineTitle").textContent = "Edit Line";
  document.getElementById("lineId").value = l.id;
  document.getElementById("lineNama").value = l.nama;
  document.getElementById("lineAreas").value = (l.areas || ["Mixing"]).join(", ");
  document.getElementById("lineUrutan").value = l.urutan;
  document.getElementById("lineAktif").checked = l.aktif;
  modalLine.show();
};

window.hapusLine = async (id) => {
  const l = lineCache.find(x => x.id === id);
  if (!confirm(`Hapus line "${l.nama}"?`)) return;
  await deleteDoc(doc(db, "line", id));
  loadLine();
  loadLantai();
};

document.getElementById("btnSaveLine").addEventListener("click", async () => {
  const id = document.getElementById("lineId").value;
  const nama = document.getElementById("lineNama").value.trim();
  const areasRaw = document.getElementById("lineAreas").value.trim();
  const urutan = Number(document.getElementById("lineUrutan").value);
  const aktif = document.getElementById("lineAktif").checked;
  if (!nama) return alert("Nama line wajib diisi");

  const areas = areasRaw
    ? areasRaw.split(",").map(a => a.trim()).filter(Boolean)
    : ["Mixing"];

  const btn = document.getElementById("btnSaveLine");
  btn.disabled = true;
  try {
    if (id) {
      await updateDoc(doc(db, "line", id), { nama, areas, urutan, aktif });
    } else {
      await addDoc(collection(db, "line"), { nama, areas, urutan, aktif, createdAt: serverTimestamp() });
    }
    modalLine.hide();
    loadLine();
  } catch (err) {
    alert("Gagal simpan: " + err.message);
  } finally {
    btn.disabled = false;
  }
});

function refreshLineDropdowns() {
  const optAll = lineCache.map(l => `<option value="${l.id}">${escapeHtml(l.nama)}</option>`).join("");
  const optAktif = lineCache.filter(l => l.aktif !== false).map(l => `<option value="${l.id}">${escapeHtml(l.nama)}</option>`).join("");

  document.getElementById("filterLantaiLine").innerHTML = '<option value="">Semua Line</option>' + optAll;
  document.getElementById("filterFieldLine").innerHTML = '<option value="">Semua Line</option>' + optAll;
  document.getElementById("filterBrittleLine").innerHTML = '<option value="">Semua Line</option>' + optAll;
  document.getElementById("lantaiLine").innerHTML = '<option value="">-- Pilih Line --</option>' + optAktif;
  document.getElementById("fieldLine").innerHTML = '<option value="">-- Pilih Line --</option>' + optAktif;
  document.getElementById("brittleLine").innerHTML = '<option value="">-- Pilih Line --</option>' + optAktif;
}

// =========================================================
// ============== LANTAI ===================================
// =========================================================
let lantaiCache = [];

async function loadLantai() {
  const box = document.getElementById("listLantai");
  box.innerHTML = '<div class="loading-state">Memuat data...</div>';
  try {
    const q = query(collection(db, "lantai"), orderBy("urutan", "asc"));
    const snap = await getDocs(q);
    lantaiCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderLantai();
  } catch (err) {
    box.innerHTML = `<div class="empty-state"><i class="bi bi-exclamation-triangle"></i><p>Gagal memuat: ${err.message}</p></div>`;
  }
}

function renderLantai() {
  const box = document.getElementById("listLantai");
  const filterLineId = document.getElementById("filterLantaiLine").value;
  let data = lantaiCache;
  if (filterLineId) data = data.filter(l => l.lineId === filterLineId);

  if (!data.length) {
    box.innerHTML = '<div class="empty-state"><i class="bi bi-building"></i><p>Belum ada lantai untuk line ini.</p></div>';
    return;
  }

  box.innerHTML = data.map(l => {
    const line = lineCache.find(x => x.id === l.lineId);
    const lineNama = line ? line.nama : (l.lineNama || '(line tidak ditemukan)');
    return `
      <div class="admin-item">
        <div class="item-icon"><i class="bi bi-building"></i></div>
        <div class="item-body">
          <p class="item-title">${escapeHtml(l.nama)}</p>
          <p class="item-sub">
            Line: <strong>${escapeHtml(lineNama)}</strong> · Urutan: ${l.urutan} · 
            <span class="badge-status ${l.aktif ? 'aktif' : 'nonaktif'}">${l.aktif ? 'Aktif' : 'Nonaktif'}</span>
          </p>
        </div>
        <div class="item-actions">
          <button class="btn-icon" onclick="editLantai('${l.id}')"><i class="bi bi-pencil"></i></button>
          <button class="btn-icon danger" onclick="hapusLantai('${l.id}')"><i class="bi bi-trash"></i></button>
        </div>
      </div>
    `;
  }).join("");
}

window.openLantaiModal = () => {
  if (!lineCache.length) return alert("Bikin line dulu.");
  document.getElementById("modalLantaiTitle").textContent = "Tambah Lantai";
  document.getElementById("lantaiId").value = "";
  document.getElementById("lantaiLine").value = "";
  document.getElementById("lantaiNama").value = "";
  document.getElementById("lantaiUrutan").value = 1;
  document.getElementById("lantaiAktif").checked = true;
  modalLantai.show();
};

window.editLantai = (id) => {
  const l = lantaiCache.find(x => x.id === id);
  if (!l) return;
  document.getElementById("modalLantaiTitle").textContent = "Edit Lantai";
  document.getElementById("lantaiId").value = l.id;
  document.getElementById("lantaiLine").value = l.lineId;
  document.getElementById("lantaiNama").value = l.nama;
  document.getElementById("lantaiUrutan").value = l.urutan;
  document.getElementById("lantaiAktif").checked = l.aktif;
  modalLantai.show();
};

window.hapusLantai = async (id) => {
  const l = lantaiCache.find(x => x.id === id);
  if (!confirm(`Hapus lantai "${l.nama}"?`)) return;
  await deleteDoc(doc(db, "lantai", id));
  loadLantai();
};

document.getElementById("btnSaveLantai").addEventListener("click", async () => {
  const id = document.getElementById("lantaiId").value;
  const lineId = document.getElementById("lantaiLine").value;
  const nama = document.getElementById("lantaiNama").value.trim();
  const urutan = Number(document.getElementById("lantaiUrutan").value);
  const aktif = document.getElementById("lantaiAktif").checked;
  if (!lineId) return alert("Pilih line dulu");
  if (!nama) return alert("Nama lantai wajib diisi");

  const line = lineCache.find(x => x.id === lineId);
  const lineNama = line ? line.nama : "";

  const btn = document.getElementById("btnSaveLantai");
  btn.disabled = true;
  try {
    if (id) {
      await updateDoc(doc(db, "lantai", id), { lineId, lineNama, nama, urutan, aktif });
    } else {
      await addDoc(collection(db, "lantai"), { lineId, lineNama, nama, urutan, aktif, createdAt: serverTimestamp() });
    }
    modalLantai.hide();
    loadLantai();
  } catch (err) {
    alert("Gagal simpan: " + err.message);
  } finally {
    btn.disabled = false;
  }
});

document.getElementById("filterLantaiLine").addEventListener("change", renderLantai);

// =========================================================
// ============== FIELD CHECKLIST ==========================
// =========================================================
let fieldCache = [];

async function loadField() {
  const box = document.getElementById("listField");
  box.innerHTML = '<div class="loading-state">Memuat data...</div>';
  try {
    const q = query(collection(db, "checklistFields"), orderBy("urutan", "asc"));
    const snap = await getDocs(q);
    fieldCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderField();
  } catch (err) {
    box.innerHTML = `<div class="empty-state"><i class="bi bi-exclamation-triangle"></i><p>Gagal memuat: ${err.message}</p></div>`;
  }
}

function renderField() {
  const box = document.getElementById("listField");
  const fl = document.getElementById("filterFieldLine").value;
  const flt = document.getElementById("filterFieldLantai").value;
  const fk = document.getElementById("filterFieldKategori").value;

  let data = fieldCache;
  if (fl) data = data.filter(f => f.lineId === fl);
  if (flt) data = data.filter(f => f.lantaiId === flt);
  if (fk) data = data.filter(f => (f.kategori || "area") === fk);

  if (!data.length) {
    box.innerHTML = '<div class="empty-state"><i class="bi bi-list-check"></i><p>Belum ada field checklist.</p></div>';
    return;
  }

  const kategoriLabel = { area: "Area", mesin: "Mesin", alat: "Alat" };
  const kategoriColor = { area: "bg-primary", mesin: "bg-warning text-dark", alat: "bg-success" };

  box.innerHTML = data.map(f => {
    const line = lineCache.find(x => x.id === f.lineId);
    const lantai = lantaiCache.find(x => x.id === f.lantaiId);
    const kat = f.kategori || "area";
    return `
      <div class="admin-item">
        <div class="item-icon"><i class="bi bi-check2-square"></i></div>
        <div class="item-body">
          <p class="item-title">
            <span class="badge ${kategoriColor[kat] || 'bg-secondary'} me-1" style="font-size:0.65rem;">
              ${kategoriLabel[kat] || kat}
            </span>
            ${escapeHtml(f.label)}
          </p>
          <p class="item-sub">
            ${escapeHtml(line?.nama || "-")} · ${escapeHtml(lantai?.nama || "-")} · 
            urutan ${f.urutan} · 
            <span class="badge-status ${f.aktif ? 'aktif' : 'nonaktif'}">${f.aktif ? 'Aktif' : 'Nonaktif'}</span>
          </p>
        </div>
        <div class="item-actions">
          <button class="btn-icon" onclick="editField('${f.id}')"><i class="bi bi-pencil"></i></button>
          <button class="btn-icon danger" onclick="hapusField('${f.id}')"><i class="bi bi-trash"></i></button>
        </div>
      </div>
    `;
  }).join("");
}

document.getElementById("filterFieldLine").addEventListener("change", () => {
  const lineId = document.getElementById("filterFieldLine").value;
  const data = lineId ? lantaiCache.filter(l => l.lineId === lineId) : lantaiCache;
  document.getElementById("filterFieldLantai").innerHTML =
    '<option value="">Semua Lantai</option>' +
    data.map(l => `<option value="${l.id}">${escapeHtml(l.nama)}</option>`).join("");
  renderField();
});
document.getElementById("filterFieldLantai").addEventListener("change", renderField);
document.getElementById("filterFieldKategori").addEventListener("change", renderField);

window.openFieldModal = () => {
  if (!lineCache.length) return alert("Bikin line dulu.");
  document.getElementById("modalFieldTitle").textContent = "Tambah Field";
  document.getElementById("fieldId").value = "";
  document.getElementById("fieldLine").value = "";
  document.getElementById("fieldLantai").innerHTML = '<option value="">-- Pilih Line Dulu --</option>';
  document.getElementById("fieldKategori").value = "area";
  document.getElementById("fieldLabel").value = "";
  document.getElementById("fieldUrutan").value = 1;
  document.getElementById("fieldAktif").checked = true;
  modalField.show();
};

window.editField = (id) => {
  const f = fieldCache.find(x => x.id === id);
  if (!f) return;
  document.getElementById("modalFieldTitle").textContent = "Edit Field";
  document.getElementById("fieldId").value = f.id;
  document.getElementById("fieldLine").value = f.lineId;
  const data = lantaiCache.filter(l => l.lineId === f.lineId);
  document.getElementById("fieldLantai").innerHTML =
    '<option value="">-- Pilih Lantai --</option>' +
    data.map(l => `<option value="${l.id}">${escapeHtml(l.nama)}</option>`).join("");
  document.getElementById("fieldLantai").value = f.lantaiId;
  document.getElementById("fieldKategori").value = f.kategori || "area";
  document.getElementById("fieldLabel").value = f.label;
  document.getElementById("fieldUrutan").value = f.urutan;
  document.getElementById("fieldAktif").checked = f.aktif;
  modalField.show();
};

window.hapusField = async (id) => {
  const f = fieldCache.find(x => x.id === id);
  if (!confirm(`Hapus field "${f.label}"?`)) return;
  await deleteDoc(doc(db, "checklistFields", id));
  loadField();
};

document.getElementById("fieldLine").addEventListener("change", () => {
  const lineId = document.getElementById("fieldLine").value;
  const data = lantaiCache.filter(l => l.lineId === lineId);
  document.getElementById("fieldLantai").innerHTML =
    '<option value="">-- Pilih Lantai --</option>' +
    data.map(l => `<option value="${l.id}">${escapeHtml(l.nama)}</option>`).join("");
});

document.getElementById("btnSaveField").addEventListener("click", async () => {
  const id = document.getElementById("fieldId").value;
  const lineId = document.getElementById("fieldLine").value;
  const lantaiId = document.getElementById("fieldLantai").value;
  const kategori = document.getElementById("fieldKategori").value;
  const label = document.getElementById("fieldLabel").value.trim();
  const urutan = Number(document.getElementById("fieldUrutan").value);
  const aktif = document.getElementById("fieldAktif").checked;

  if (!lineId) return alert("Pilih line dulu");
  if (!lantaiId) return alert("Pilih lantai dulu");
  if (!label) return alert("Label wajib diisi");

  const line = lineCache.find(x => x.id === lineId);
  const lantai = lantaiCache.find(x => x.id === lantaiId);

  const btn = document.getElementById("btnSaveField");
  btn.disabled = true;
  try {
    const data = {
      lineId, lineNama: line?.nama || "",
      lantaiId, lantaiNama: lantai?.nama || "",
      kategori,
      label, urutan, aktif
    };
    if (id) {
      await updateDoc(doc(db, "checklistFields", id), data);
    } else {
      await addDoc(collection(db, "checklistFields"), { ...data, createdAt: serverTimestamp() });
    }
    modalField.hide();
    loadField();
  } catch (err) {
    alert("Gagal simpan: " + err.message);
  } finally {
    btn.disabled = false;
  }
});

// =========================================================
// ============== BRITTLE ITEMS ============================
// =========================================================
let brittleCache = [];

async function loadBrittle() {
  const box = document.getElementById("listBrittle");
  box.innerHTML = '<div class="loading-state">Memuat data...</div>';
  try {
    const q = query(collection(db, "brittleItems"), orderBy("urutan", "asc"));
    const snap = await getDocs(q);
    brittleCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderBrittle();
  } catch (err) {
    box.innerHTML = `<div class="empty-state"><i class="bi bi-exclamation-triangle"></i><p>Gagal memuat: ${err.message}</p></div>`;
  }
}

function renderBrittle() {
  const box = document.getElementById("listBrittle");
  const fl = document.getElementById("filterBrittleLine").value;
  const fa = document.getElementById("filterBrittleArea").value;
  const flt = document.getElementById("filterBrittleLantai").value;

  let data = brittleCache;
  if (fl) data = data.filter(b => b.lineId === fl);
  if (fa) data = data.filter(b => b.area === fa);
  if (flt) data = data.filter(b => b.lantaiId === flt);

  if (!data.length) {
    box.innerHTML = '<div class="empty-state"><i class="bi bi-search"></i><p>Belum ada brittle item.</p></div>';
    return;
  }

  box.innerHTML = data.map(b => {
    const line = lineCache.find(x => x.id === b.lineId);
    return `
      <div class="admin-item">
        <div class="item-icon"><i class="bi bi-search"></i></div>
        <div class="item-body">
          <p class="item-title">${escapeHtml(b.posisi)}</p>
          <p class="item-sub">
            ${escapeHtml(line?.nama || "-")} · ${escapeHtml(b.area || "-")} · 
            ${escapeHtml(b.lantaiNama || "-")} · 
            Jenis ${b.jenis} · Total ${b.total} · urutan ${b.urutan} · 
            <span class="badge-status ${b.aktif ? 'aktif' : 'nonaktif'}">${b.aktif ? 'Aktif' : 'Nonaktif'}</span>
          </p>
        </div>
        <div class="item-actions">
          <button class="btn-icon" onclick="editBrittle('${b.id}')"><i class="bi bi-pencil"></i></button>
          <button class="btn-icon danger" onclick="hapusBrittle('${b.id}')"><i class="bi bi-trash"></i></button>
        </div>
      </div>
    `;
  }).join("");
}

document.getElementById("filterBrittleLine").addEventListener("change", () => {
  const lineId = document.getElementById("filterBrittleLine").value;
  const data = lineId ? lantaiCache.filter(l => l.lineId === lineId) : lantaiCache;
  document.getElementById("filterBrittleLantai").innerHTML =
    '<option value="">Semua Lantai</option>' +
    data.map(l => `<option value="${l.id}">${escapeHtml(l.nama)}</option>`).join("");
  renderBrittle();
});
document.getElementById("filterBrittleArea").addEventListener("change", renderBrittle);
document.getElementById("filterBrittleLantai").addEventListener("change", renderBrittle);

window.openBrittleModal = () => {
  if (!lineCache.length) return alert("Bikin line dulu.");
  document.getElementById("modalBrittleTitle").textContent = "Tambah Brittle Item";
  document.getElementById("brittleId").value = "";
  document.getElementById("brittleLine").value = "";
  document.getElementById("brittleArea").innerHTML = '<option value="">-- Pilih Line Dulu --</option>';
  document.getElementById("brittleLantai").innerHTML = '<option value="">-- Pilih Line Dulu --</option>';
  document.getElementById("brittlePosisi").value = "";
  document.getElementById("brittleJenis").value = "A";
  document.getElementById("brittleTotal").value = 1;
  document.getElementById("brittleUrutan").value = 1;
  document.getElementById("brittleAktif").checked = true;
  modalBrittle.show();
};

window.editBrittle = (id) => {
  const b = brittleCache.find(x => x.id === id);
  if (!b) return;
  document.getElementById("modalBrittleTitle").textContent = "Edit Brittle Item";
  document.getElementById("brittleId").value = b.id;
  document.getElementById("brittleLine").value = b.lineId;

  const line = lineCache.find(x => x.id === b.lineId);
  const areas = line?.areas || ["Mixing"];
  document.getElementById("brittleArea").innerHTML =
    '<option value="">-- Pilih Area --</option>' +
    areas.map(a => `<option value="${a}">${a}</option>`).join("");
  document.getElementById("brittleArea").value = b.area;

  const lantaiData = lantaiCache.filter(l => l.lineId === b.lineId);
  document.getElementById("brittleLantai").innerHTML =
    '<option value="">-- Pilih Lantai --</option>' +
    lantaiData.map(l => `<option value="${l.id}">${escapeHtml(l.nama)}</option>`).join("");
  document.getElementById("brittleLantai").value = b.lantaiId || "";

  document.getElementById("brittlePosisi").value = b.posisi;
  document.getElementById("brittleJenis").value = b.jenis;
  document.getElementById("brittleTotal").value = b.total;
  document.getElementById("brittleUrutan").value = b.urutan;
  document.getElementById("brittleAktif").checked = b.aktif;
  modalBrittle.show();
};

window.hapusBrittle = async (id) => {
  const b = brittleCache.find(x => x.id === id);
  if (!confirm(`Hapus brittle item "${b.posisi}"?`)) return;
  await deleteDoc(doc(db, "brittleItems", id));
  loadBrittle();
};

document.getElementById("brittleLine").addEventListener("change", (e) => {
  const lineId = e.target.value;
  const line = lineCache.find(x => x.id === lineId);
  const areas = line?.areas || ["Mixing"];
  document.getElementById("brittleArea").innerHTML =
    '<option value="">-- Pilih Area --</option>' +
    areas.map(a => `<option value="${a}">${a}</option>`).join("");

  const lantaiData = lantaiCache.filter(l => l.lineId === lineId);
  document.getElementById("brittleLantai").innerHTML =
    '<option value="">-- Pilih Lantai --</option>' +
    lantaiData.map(l => `<option value="${l.id}">${escapeHtml(l.nama)}</option>`).join("");
});

document.getElementById("btnSaveBrittle").addEventListener("click", async () => {
  const id = document.getElementById("brittleId").value;
  const lineId = document.getElementById("brittleLine").value;
  const area = document.getElementById("brittleArea").value;
  const lantaiId = document.getElementById("brittleLantai").value;
  const posisi = document.getElementById("brittlePosisi").value.trim();
  const jenis = document.getElementById("brittleJenis").value;
  const total = Number(document.getElementById("brittleTotal").value);
  const urutan = Number(document.getElementById("brittleUrutan").value);
  const aktif = document.getElementById("brittleAktif").checked;

  if (!lineId) return alert("Pilih line dulu");
  if (!area) return alert("Pilih area dulu");
  if (!lantaiId) return alert("Pilih lantai dulu");
  if (!posisi) return alert("Posisi wajib diisi");

  const line = lineCache.find(x => x.id === lineId);
  const lantai = lantaiCache.find(x => x.id === lantaiId);

  const btn = document.getElementById("btnSaveBrittle");
  btn.disabled = true;
  try {
    const data = {
      lineId, lineNama: line?.nama || "",
      area,
      lantaiId, lantaiNama: lantai?.nama || "",
      posisi, jenis, total, urutan, aktif
    };
    if (id) {
      await updateDoc(doc(db, "brittleItems", id), data);
    } else {
      await addDoc(collection(db, "brittleItems"), { ...data, createdAt: serverTimestamp() });
    }
    modalBrittle.hide();
    loadBrittle();
  } catch (err) {
    alert("Gagal simpan: " + err.message);
  } finally {
    btn.disabled = false;
  }
});

// =========================================================
// ============== USER =====================================
// =========================================================
let userCache = [];

async function loadUser() {
  const box = document.getElementById("listUser");
  box.innerHTML = '<div class="loading-state">Memuat data...</div>';
  try {
    const snap = await getDocs(collection(db, "users"));
    userCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderUser();
  } catch (err) {
    box.innerHTML = `<div class="empty-state"><i class="bi bi-exclamation-triangle"></i><p>Gagal memuat: ${err.message}</p></div>`;
  }
}

function renderUser() {
  const box = document.getElementById("listUser");
  if (!userCache.length) {
    box.innerHTML = '<div class="empty-state"><i class="bi bi-people"></i><p>Belum ada user.</p></div>';
    return;
  }
  box.innerHTML = userCache.map(u => `
    <div class="admin-item">
      <div class="item-icon"><i class="bi bi-person"></i></div>
      <div class="item-body">
        <p class="item-title">${escapeHtml(u.nama || "-")}</p>
        <p class="item-sub">
          @${escapeHtml(u.username || "-")} · 
          <span class="badge-role ${u.role}">${u.role}</span>
        </p>
      </div>
      <div class="item-actions">
        <button class="btn-icon" onclick="editUser('${u.id}')"><i class="bi bi-pencil"></i></button>
        <button class="btn-icon danger" onclick="hapusUser('${u.id}')"><i class="bi bi-trash"></i></button>
      </div>
    </div>
  `).join("");
}

window.openUserModal = () => {
  document.getElementById("modalUserTitle").textContent = "Tambah User";
  document.getElementById("userId").value = "";
  document.getElementById("userNama").value = "";
  document.getElementById("userUsername").value = "";
  document.getElementById("userUsername").disabled = false;
  document.getElementById("userPassword").value = "";
  document.getElementById("userRole").value = "petugas";
  document.getElementById("wrapUserPassword").style.display = "block";
  modalUser.show();
};

window.editUser = (id) => {
  const u = userCache.find(x => x.id === id);
  if (!u) return;
  document.getElementById("modalUserTitle").textContent = "Edit User";
  document.getElementById("userId").value = u.id;
  document.getElementById("userNama").value = u.nama || "";
  document.getElementById("userUsername").value = u.username || "";
  document.getElementById("userUsername").disabled = true;
  document.getElementById("userRole").value = u.role;
  document.getElementById("wrapUserPassword").style.display = "none";
  modalUser.show();
};

window.hapusUser = async (id) => {
  if (id === user.uid) return alert("Ga bisa hapus akun sendiri.");
  const u = userCache.find(x => x.id === id);
  if (!confirm(`Hapus user "${u.nama || u.username}"?`)) return;
  await deleteDoc(doc(db, "users", id));
  loadUser();
};

document.getElementById("btnSaveUser").addEventListener("click", async () => {
  const id = document.getElementById("userId").value;
  const nama = document.getElementById("userNama").value.trim();
  const username = document.getElementById("userUsername").value.trim().toLowerCase();
  const password = document.getElementById("userPassword").value;
  const role = document.getElementById("userRole").value;

  if (!nama || !username) return alert("Nama & username wajib diisi");
  if (!/^[a-z0-9._-]+$/.test(username)) {
    return alert("Username cuma boleh huruf kecil, angka, titik, underscore, strip");
  }

  const email = username + DOMAIN;
  const btn = document.getElementById("btnSaveUser");
  btn.disabled = true;

  try {
    if (id) {
      await updateDoc(doc(db, "users", id), { nama, role });
    } else {
      if (!password || password.length < 6) throw new Error("Password minimal 6 karakter");
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      const newUid = cred.user.uid;
      await setDoc(doc(db, "users", newUid), {
        nama, username, email, role, createdAt: serverTimestamp()
      });
      alert("User berhasil dibuat. Kamu akan logout, silakan login ulang.");
      await signOut(auth);
      window.location.href = "index.html";
      return;
    }
    modalUser.hide();
    loadUser();
  } catch (err) {
    alert("Gagal simpan: " + err.message);
  } finally {
    btn.disabled = false;
  }
});

// =========================================================
// ============== UTIL =====================================
// =========================================================
function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// =========================================================
// ============== INIT =====================================
// =========================================================
await loadLine();
await loadLantai();
await loadField();
await loadBrittle();
loadUser();