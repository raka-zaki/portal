import { db, auth } from "./firebase-config.js";
import { protectPage, logout } from "./guard.js";
import {
  collection, doc, addDoc, updateDoc, deleteDoc,
  getDocs, query, orderBy, serverTimestamp, setDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  createUserWithEmailAndPassword, signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const DOMAIN = "@produksi.local";

// ---------- GUARD ----------
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

// ---------- TABS ----------
const tabs = document.querySelectorAll(".admin-tabs button");
const panels = {
  line:   document.getElementById("panel-line"),
  lantai: document.getElementById("panel-lantai"),
  field:  document.getElementById("panel-field"),
  user:   document.getElementById("panel-user"),
};
tabs.forEach(btn => {
  btn.addEventListener("click", () => {
    tabs.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    Object.values(panels).forEach(p => p.style.display = "none");
    panels[btn.dataset.tab].style.display = "block";
  });
});

const modalLine   = new bootstrap.Modal("#modalLine");
const modalLantai = new bootstrap.Modal("#modalLantai");
const modalField  = new bootstrap.Modal("#modalField");
const modalUser   = new bootstrap.Modal("#modalUser");

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
    refreshDropdownLine();
    refreshFilterLine();
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
        <p class="item-sub">Urutan: ${l.urutan} · 
          <span class="badge-status ${l.aktif ? 'aktif' : 'nonaktif'}">
            ${l.aktif ? 'Aktif' : 'Nonaktif'}
          </span>
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
  document.getElementById("lineUrutan").value = l.urutan;
  document.getElementById("lineAktif").checked = l.aktif;
  modalLine.show();
};

window.hapusLine = async (id) => {
  const l = lineCache.find(x => x.id === id);
  if (!confirm(`Hapus line "${l.nama}"?\n\nCatatan: lantai di line ini tidak otomatis terhapus.`)) return;
  await deleteDoc(doc(db, "line", id));
  loadLine();
  loadLantai();
};

document.getElementById("btnSaveLine").addEventListener("click", async () => {
  const id = document.getElementById("lineId").value;
  const nama = document.getElementById("lineNama").value.trim();
  const urutan = Number(document.getElementById("lineUrutan").value);
  const aktif = document.getElementById("lineAktif").checked;
  if (!nama) return alert("Nama line wajib diisi");

  const btn = document.getElementById("btnSaveLine");
  btn.disabled = true;
  try {
    if (id) {
      await updateDoc(doc(db, "line", id), { nama, urutan, aktif });
    } else {
      await addDoc(collection(db, "line"), { nama, urutan, aktif, createdAt: serverTimestamp() });
    }
    modalLine.hide();
    loadLine();
  } catch (err) {
    alert("Gagal simpan: " + err.message);
  } finally {
    btn.disabled = false;
  }
});

function refreshDropdownLine() {
  const opt = lineCache
    .filter(l => l.aktif !== false)
    .map(l => `<option value="${l.id}">${escapeHtml(l.nama)}</option>`)
    .join("");
  document.getElementById("lantaiLine").innerHTML =
    '<option value="">-- Pilih Line --</option>' + opt;
}

function refreshFilterLine() {
  const opt = lineCache
    .map(l => `<option value="${l.id}">${escapeHtml(l.nama)}</option>`)
    .join("");
  document.getElementById("filterLantaiLine").innerHTML =
    '<option value="">Semua Line</option>' + opt;
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
            Line: <strong>${escapeHtml(lineNama)}</strong> · 
            Urutan: ${l.urutan} · 
            <span class="badge-status ${l.aktif ? 'aktif' : 'nonaktif'}">
              ${l.aktif ? 'Aktif' : 'Nonaktif'}
            </span>
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
  if (!lineCache.length) {
    alert("Bikin line dulu sebelum tambah lantai.");
    return;
  }
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
      await addDoc(collection(db, "lantai"), {
        lineId, lineNama, nama, urutan, aktif, createdAt: serverTimestamp()
      });
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
let filterKategori = "all";

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
  const data = filterKategori === "all"
    ? fieldCache
    : fieldCache.filter(f => f.kategori === filterKategori);

  if (!data.length) {
    box.innerHTML = '<div class="empty-state"><i class="bi bi-list-check"></i><p>Belum ada field untuk kategori ini.</p></div>';
    return;
  }

  box.innerHTML = data.map(f => `
    <div class="admin-item">
      <div class="item-icon">
        <i class="bi ${f.tipe === 'text' ? 'bi-input-cursor-text' : 'bi-check2-square'}"></i>
      </div>
      <div class="item-body">
        <p class="item-title">${escapeHtml(f.label)}</p>
        <p class="item-sub">
          ${f.kategori} · ${f.tipe} · urutan ${f.urutan} · 
          <span class="badge-status ${f.aktif ? 'aktif' : 'nonaktif'}">
            ${f.aktif ? 'Aktif' : 'Nonaktif'}
          </span>
        </p>
      </div>
      <div class="item-actions">
        <button class="btn-icon" onclick="editField('${f.id}')"><i class="bi bi-pencil"></i></button>
        <button class="btn-icon danger" onclick="hapusField('${f.id}')"><i class="bi bi-trash"></i></button>
      </div>
    </div>
  `).join("");
}

document.querySelectorAll(".filter-kategori").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".filter-kategori").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    filterKategori = btn.dataset.kat;
    renderField();
  });
});

window.openFieldModal = () => {
  document.getElementById("modalFieldTitle").textContent = "Tambah Field";
  document.getElementById("fieldId").value = "";
  document.getElementById("fieldLabel").value = "";
  document.getElementById("fieldKategori").value = "kebersihan";
  document.getElementById("fieldTipe").value = "boolean";
  document.getElementById("fieldUrutan").value = (fieldCache.length + 1);
  document.getElementById("fieldAktif").checked = true;
  modalField.show();
};

window.editField = (id) => {
  const f = fieldCache.find(x => x.id === id);
  if (!f) return;
  document.getElementById("modalFieldTitle").textContent = "Edit Field";
  document.getElementById("fieldId").value = f.id;
  document.getElementById("fieldLabel").value = f.label;
  document.getElementById("fieldKategori").value = f.kategori;
  document.getElementById("fieldTipe").value = f.tipe;
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

document.getElementById("btnSaveField").addEventListener("click", async () => {
  const id = document.getElementById("fieldId").value;
  const label = document.getElementById("fieldLabel").value.trim();
  const kategori = document.getElementById("fieldKategori").value;
  const tipe = document.getElementById("fieldTipe").value;
  const urutan = Number(document.getElementById("fieldUrutan").value);
  const aktif = document.getElementById("fieldAktif").checked;
  if (!label) return alert("Label wajib diisi");

  const btn = document.getElementById("btnSaveField");
  btn.disabled = true;
  try {
    if (id) {
      await updateDoc(doc(db, "checklistFields", id), { label, kategori, tipe, urutan, aktif });
    } else {
      await addDoc(collection(db, "checklistFields"),
        { label, kategori, tipe, urutan, aktif, createdAt: serverTimestamp() });
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
  if (!confirm(`Hapus user "${u.nama || u.username}"?\n\nCatatan: ini hanya hapus data di Firestore, akun Auth harus dihapus manual dari Firebase Console.`)) return;
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
loadField();
loadUser();