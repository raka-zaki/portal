import { db, storage } from "./firebase-config.js";
import { protectPage, logout } from "./guard.js";
import {
  collection, addDoc, getDocs, query, where, orderBy, serverTimestamp,
  doc, updateDoc, deleteDoc, getDoc
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

// ---------- STATE ----------
const KATEGORI_LIST = ["area", "mesin", "alat"];
const KATEGORI_LABEL = { area: "Area", mesin: "Mesin", alat: "Alat dalam Lemari" };

let lineCache = [];
let lantaiCache = [];
let fieldsByKategori = { area: [], mesin: [], alat: [] };
let itemsByKategori = { area: [], mesin: [], alat: [] };
let currentLineId = "";
let currentLantaiId = "";
let currentKategori = "area";
let editingId = null;       // ID submission yang lagi diedit
let editingKategori = null; // Kategori submission yang diedit

// Cek boleh edit atau ga
function bolehEdit(submission) {
  if (!submission) return false;
  // Superadmin & supervisor: boleh semua
  if (user.role === "superadmin" || user.role === "supervisor") return true;
  // Petugas: cuma submission sendiri
  return submission.petugasId === user.uid;
}

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

// ---------- LOAD SEMUA LANTAI ----------
async function loadLantaiAll() {
  const q = query(collection(db, "lantai"), orderBy("urutan", "asc"));
  const snap = await getDocs(q);
  lantaiCache = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(l => l.aktif !== false);
}

function refreshLantaiByLine(lineId) {
  const sel = document.getElementById("inputLantai");
  const data = lineId ? lantaiCache.filter(l => l.lineId === lineId) : [];
  if (!data.length) {
    sel.innerHTML = '<option value="">-- Pilih Line Dulu --</option>';
    sel.disabled = true;
    return;
  }
  sel.innerHTML = '<option value="">-- Pilih Lantai --</option>' +
    data.map(l => `<option value="${l.id}">${escapeHtml(l.nama)}</option>`).join("");
  sel.disabled = false;
}

document.getElementById("inputLine").addEventListener("change", (e) => {
  if (editingId) return; // jangan bisa ganti line saat mode edit
  currentLineId = e.target.value;
  refreshLantaiByLine(e.target.value);
  resetSemua();
});

document.getElementById("inputLantai").addEventListener("change", async (e) => {
  if (editingId) return;
  currentLantaiId = e.target.value;
  if (currentLantaiId) {
    await loadFieldsSemuaKategori(currentLantaiId);
  } else {
    resetSemua();
  }
});

function resetSemua() {
  fieldsByKategori = { area: [], mesin: [], alat: [] };
  itemsByKategori = { area: [], mesin: [], alat: [] };
  currentKategori = "area";
  editingId = null;
  editingKategori = null;
  document.getElementById("checklistTabs").style.display = "none";
  document.getElementById("listChecklist").innerHTML =
    '<div class="loading-state">Pilih line & lantai dulu...</div>';
  document.getElementById("formMode").textContent = "Input Baru";
  document.getElementById("btnBatalEdit").style.display = "none";
  document.querySelector(".form-card").classList.remove("editing");
  updateProgress();
}

await loadLine();
await loadLantaiAll();

// ---------- LOAD FIELDS ----------
// Versi untuk INPUT BARU (reset items ke default)
async function loadFieldsSemuaKategori(lantaiId) {
  const box = document.getElementById("listChecklist");
  box.innerHTML = '<div class="loading-state">Memuat field...</div>';

  let all;
  try {
    const q = query(
      collection(db, "checklistFields"),
      where("lantaiId", "==", lantaiId),
      where("aktif", "==", true),
      orderBy("urutan", "asc")
    );
    const snap = await getDocs(q);
    all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    const snap = await getDocs(collection(db, "checklistFields"));
    all = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(f => f.lantaiId === lantaiId && f.aktif !== false)
      .sort((a, b) => (a.urutan || 0) - (b.urutan || 0));
  }

  fieldsByKategori = { area: [], mesin: [], alat: [] };
  all.forEach(f => {
    const kat = f.kategori || "area";
    if (fieldsByKategori[kat]) fieldsByKategori[kat].push(f);
  });

  // Reset items ke default
  KATEGORI_LIST.forEach(kat => {
    itemsByKategori[kat] = fieldsByKategori[kat].map(f => ({
      field: f, status: "-", keterangan: "", file: null, fotoUrl: null
    }));
  });

  const adaIsi = KATEGORI_LIST.find(k => fieldsByKategori[k].length > 0);
  currentKategori = adaIsi || "area";

  document.getElementById("checklistTabs").style.display = "flex";
  updateTabCount();
  setActiveTab(currentKategori);
  renderKategori();
}

// Versi untuk EDIT: load fields tapi JANGAN reset items
async function loadFieldsForEdit(lantaiId) {
  const box = document.getElementById("listChecklist");
  box.innerHTML = '<div class="loading-state">Memuat field...</div>';

  let all;
  try {
    const q = query(
      collection(db, "checklistFields"),
      where("lantaiId", "==", lantaiId),
      where("aktif", "==", true),
      orderBy("urutan", "asc")
    );
    const snap = await getDocs(q);
    all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    const snap = await getDocs(collection(db, "checklistFields"));
    all = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(f => f.lantaiId === lantaiId && f.aktif !== false)
      .sort((a, b) => (a.urutan || 0) - (b.urutan || 0));
  }

  fieldsByKategori = { area: [], mesin: [], alat: [] };
  all.forEach(f => {
    const kat = f.kategori || "area";
    if (fieldsByKategori[kat]) fieldsByKategori[kat].push(f);
  });

  // ⭐ Reset items default (nanti di-override sama editSubmission)
  KATEGORI_LIST.forEach(kat => {
    itemsByKategori[kat] = fieldsByKategori[kat].map(f => ({
      field: f, status: "-", keterangan: "", file: null, fotoUrl: null
    }));
  });

  // ⭐ JANGAN render dulu — tunggu override di editSubmission
  // renderKategori() dipanggil di editSubmission setelah override
}

// ---------- TAB HANDLING ----------
document.querySelectorAll(".checklist-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    saveCurrentInputs();
    currentKategori = tab.dataset.kategori;
    setActiveTab(currentKategori);
    renderKategori();
  });
});

function setActiveTab(kat) {
  document.querySelectorAll(".checklist-tab").forEach(t => {
    t.classList.toggle("active", t.dataset.kategori === kat);
  });
  document.getElementById("submitKategori").textContent = KATEGORI_LABEL[kat];
}

function updateTabCount() {
  KATEGORI_LIST.forEach(kat => {
    const count = fieldsByKategori[kat].length;
    const el = document.getElementById(`count-${kat}`);
    if (el) el.textContent = count;

    const tab = document.querySelector(`.checklist-tab[data-kategori="${kat}"]`);
    if (tab) {
      const filled = itemsByKategori[kat].some(i => i.status === "OK" || i.status === "NOK");
      tab.classList.toggle("done", filled && count > 0);
    }
  });
}

function saveCurrentInputs() {
  const list = itemsByKategori[currentKategori];
  list.forEach(item => {
    const group = document.querySelector(`.status-btn-group[data-field-id="${item.field.id}"]`);
    if (!group) return;
    const active = group.querySelector(".status-btn.active");
    if (active) item.status = active.dataset.status;
    const ket = document.querySelector(`.ket-input[data-field-id="${item.field.id}"]`);
    if (ket) item.keterangan = ket.value.trim();
    const foto = document.querySelector(`.foto-input[data-field-id="${item.field.id}"]`);
    if (foto && foto.files && foto.files[0]) item.file = foto.files[0];
  });
  updateTabCount();
}

// ---------- RENDER KATEGORI ----------
function renderKategori() {
  const box = document.getElementById("listChecklist");
  const list = itemsByKategori[currentKategori];

  if (!list.length) {
    box.innerHTML = `<div class="empty-state"><i class="bi bi-list-check"></i><p>Belum ada field checklist <strong>${KATEGORI_LABEL[currentKategori]}</strong> untuk lantai ini.<br>Hubungi Super Admin.</p></div>`;
    updateProgress();
    return;
  }

  box.innerHTML = list.map((it) => {
    const f = it.field;
    const isNok = it.status === "NOK";
    return `
      <div class="checklist-item ${isNok ? 'nok' : ''}" data-field-id="${f.id}">
        <div class="d-flex justify-content-between align-items-start gap-2">
          <label class="item-label">${escapeHtml(f.label)}</label>
          <div class="status-btn-group" data-field-id="${f.id}">
            <button type="button" class="status-btn skip ${it.status === '-' ? 'active' : ''}" data-status="-">—</button>
            <button type="button" class="status-btn ok ${it.status === 'OK' ? 'active' : ''}" data-status="OK">✓</button>
            <button type="button" class="status-btn nok ${it.status === 'NOK' ? 'active' : ''}" data-status="NOK">✗</button>
          </div>
        </div>
        <input type="text" class="form-control form-control-sm ket-input mt-2" 
               data-field-id="${f.id}" placeholder="Keterangan (wajib kalau ✗)" 
               value="${escapeHtml(it.keterangan)}"
               style="display:${isNok ? 'block' : 'none'};" />
        <div class="foto-input-wrap mt-2" style="display:${isNok ? 'block' : 'none'};" data-foto-wrap="${f.id}">
          <input type="file" class="form-control form-control-sm foto-input" 
                 data-field-id="${f.id}" accept="image/*" capture="environment" />
          ${it.fotoUrl ? `<div class="mt-1 small"><a href="${it.fotoUrl}" target="_blank"><i class="bi bi-image"></i> Lihat foto lama</a></div>` : ""}
          <div class="small text-muted mt-1">
            <i class="bi bi-info-circle"></i> Foto opsional — upload kalau ada kondisi khusus
          </div>
        </div>
        <div class="item-order">urutan ${f.urutan}</div>
      </div>
    `;
  }).join("");

  box.querySelectorAll(".status-btn-group").forEach(group => {
    group.querySelectorAll(".status-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        group.querySelectorAll(".status-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        const fieldId = group.dataset.fieldId;
        const status = btn.dataset.status;
        const item = box.querySelector(`.checklist-item[data-field-id="${fieldId}"]`);
        const ketInput = box.querySelector(`.ket-input[data-field-id="${fieldId}"]`);
        const fotoWrap = box.querySelector(`[data-foto-wrap="${fieldId}"]`);

        if (status === "NOK") {
          item.classList.add("nok");
          ketInput.style.display = "block";
          fotoWrap.style.display = "block";
        } else {
          item.classList.remove("nok");
          ketInput.style.display = "none";
          fotoWrap.style.display = "none";
          ketInput.value = "";
          const fi = box.querySelector(`.foto-input[data-field-id="${fieldId}"]`);
          if (fi) fi.value = "";
        }
        updateProgress();
        updateTabCount();
      });
    });
  });
  box.querySelectorAll(".ket-input").forEach(t => t.addEventListener("input", updateProgress));
  updateProgress();
}

// ---------- PROGRESS ----------
function updateProgress() {
  const list = itemsByKategori[currentKategori] || [];
  let ok = 0, nok = 0;
  list.forEach(item => {
    const group = document.querySelector(`.status-btn-group[data-field-id="${item.field.id}"]`);
    if (!group) return;
    const active = group.querySelector(".status-btn.active");
    if (!active) return;
    if (active.dataset.status === "OK") ok++;
    if (active.dataset.status === "NOK") nok++;
  });
  document.getElementById("progressOk").textContent = ok;
  document.getElementById("progressNok").textContent = nok;
  document.getElementById("progressTotal").textContent = list.length;
  document.getElementById("btnSubmit").disabled = list.length === 0 || (ok === 0 && nok === 0);
}

// ---------- SUBMIT / UPDATE ----------
document.getElementById("btnSubmit").addEventListener("click", async () => {
  if (!currentLineId) return alert("Pilih line dulu");
  if (!currentLantaiId) return alert("Pilih lantai dulu");
  const shift = document.getElementById("inputShift").value;

  saveCurrentInputs();

  const list = itemsByKategori[currentKategori];
  if (!list.length) return alert(`Belum ada item ${KATEGORI_LABEL[currentKategori]}`);

  for (const it of list) {
    if (it.status === "NOK" && !it.keterangan) {
      return alert(`Keterangan wajib diisi untuk item ✗:\n"${it.field.label}"`);
    }
  }

  const adaIsi = list.some(i => i.status === "OK" || i.status === "NOK");
  if (!adaIsi) return alert(`Isi minimal 1 item ${KATEGORI_LABEL[currentKategori]} dulu`);

  const btn = document.getElementById("btnSubmit");
  const mode = editingId ? "Update" : "Simpan";
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner-border spinner-border-sm"></span> ${mode}...`;

  try {
    const line = lineCache.find(l => l.id === currentLineId);
    const lantai = lantaiCache.find(l => l.id === currentLantaiId);

    // Upload foto baru
    const items = [];
    for (const d of list) {
      let fotoUrl = d.fotoUrl || null; // pertahankan foto lama
      if (d.file) {
        const ts = Date.now();
        const path = `checklist/${currentLineId}/${currentLantaiId}/${currentKategori}/${d.field.id}_${ts}_${d.file.name}`;
        const storageRef = ref(storage, path);
        await uploadBytes(storageRef, d.file);
        fotoUrl = await getDownloadURL(storageRef);
      }
      items.push({
        fieldId: d.field.id,
        label: d.field.label,
        status: d.status,
        keterangan: d.keterangan,
        fotoUrl
      });
    }

    if (editingId) {
      // UPDATE
      await updateDoc(doc(db, "checklistSubmissions", editingId), {
        shift,
        items,
        updatedAt: serverTimestamp(),
        updatedBy: user.nama || user.email
      });
      alert("Checklist berhasil diupdate ✅");
    } else {
      // CREATE
      await addDoc(collection(db, "checklistSubmissions"), {
        lineId: currentLineId,
        lineNama: line?.nama || "-",
        lantaiId: currentLantaiId,
        lantaiNama: lantai?.nama || "-",
        kategori: currentKategori,
        shift,
        items,
        petugasId: user.uid,
        petugasNama: user.nama || user.email,
        timestamp: serverTimestamp(),
        tanggal: new Date().toISOString().slice(0, 10),
      });
      alert(`Checklist ${KATEGORI_LABEL[currentKategori]} berhasil disimpan ✅`);
    }

    // Reset
    cancelEdit();
    loadRiwayat();
  } catch (err) {
    alert("Gagal simpan: " + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i class="bi bi-send"></i> Simpan <span id="submitKategori">${KATEGORI_LABEL[currentKategori]}</span>`;
  }
});

// ---------- CANCEL EDIT ----------
document.getElementById("btnBatalEdit").addEventListener("click", cancelEdit);

function cancelEdit() {
  editingId = null;
  editingKategori = null;
  document.getElementById("formMode").textContent = "Input Baru";
  document.getElementById("btnBatalEdit").style.display = "none";
  document.querySelector(".form-card").classList.remove("editing");

  // Reset form
  document.getElementById("inputLine").value = "";
  document.getElementById("inputLantai").innerHTML = '<option value="">-- Pilih Line Dulu --</option>';
  document.getElementById("inputLantai").disabled = true;
  document.getElementById("inputShift").value = shiftAktif;
  document.getElementById("checklistTabs").style.display = "none";
  document.getElementById("listChecklist").innerHTML =
    '<div class="loading-state">Pilih line & lantai dulu...</div>';
  fieldsByKategori = { area: [], mesin: [], alat: [] };
  itemsByKategori = { area: [], mesin: [], alat: [] };
  currentLineId = ""; currentLantaiId = "";
  updateProgress();
}

window.editSubmission = async (id) => {
  const r = riwayatCache.find(x => x.id === id);
  if (!r) return;
  if (!bolehEdit(r)) return alert("Kamu tidak punya akses untuk edit ini.");

  console.log("Edit submission:", r);

  editingId = id;

  // Set Line & Lantai & Shift
  currentLineId = r.lineId;
  currentLantaiId = r.lantaiId;
  document.getElementById("inputLine").value = r.lineId;
  refreshLantaiByLine(r.lineId);
  document.getElementById("inputLantai").value = r.lantaiId;
  document.getElementById("inputShift").value = r.shift || shiftAktif;

  // Load field master
  await loadFieldsForEdit(r.lantaiId);

  // ⭐ DETEKSI KATEGORI:
  // Kalau submission punya kategori → pakai itu
  // Kalau ga ada → deteksi dari field master berdasarkan fieldId
  let kategoriDetect = r.kategori || null;

  if (!kategoriDetect) {
    // Cari kategori dari field master berdasarkan fieldId di submission
    const itemsSubmisi = r.items || [];
    const firstFieldId = itemsSubmisi[0]?.fieldId;

    for (const kat of KATEGORI_LIST) {
      const found = fieldsByKategori[kat]?.find(f => f.id === firstFieldId);
      if (found) {
        kategoriDetect = kat;
        break;
      }
    }

    // Kalau masih ga ketemu, fallback ke kategori pertama yang ada
    if (!kategoriDetect) {
      kategoriDetect = KATEGORI_LIST.find(k => fieldsByKategori[k].length > 0) || "area";
    }

    console.log("Kategori ga ada di submission, detect:", kategoriDetect);
  }

  editingKategori = kategoriDetect;

  document.getElementById("formMode").textContent = "Edit Checklist";
  document.getElementById("btnBatalEdit").style.display = "block";
  document.querySelector(".form-card").classList.add("editing");

  // ⭐ REBUILD dari submission
  const itemsSubmisi = r.items || [];
  const itemsBaru = itemsSubmisi.map((it, idx) => ({
    field: {
      id: it.fieldId,
      label: it.label,
      urutan: idx + 1,
      kategori: editingKategori,
    },
    status: it.status || "-",
    keterangan: it.keterangan || "",
    fotoUrl: it.fotoUrl || null,
    file: null,
  }));

  itemsByKategori[editingKategori] = itemsBaru;
  fieldsByKategori[editingKategori] = itemsBaru.map(i => i.field);

  console.log("Items setelah rebuild:", itemsByKategori);

  currentKategori = editingKategori;
  document.getElementById("checklistTabs").style.display = "flex";
  updateTabCount();
  setActiveTab(currentKategori);
  renderKategori();

  document.querySelector(".form-card").scrollIntoView({ behavior: "smooth", block: "start" });
};

// ---------- HAPUS SUBMISSION ----------
window.hapusSubmission = async (id) => {
  const r = riwayatCache.find(x => x.id === id);
  if (!r) return;
  if (!bolehEdit(r)) return alert("Kamu tidak punya akses untuk hapus ini.");

  const kat = KATEGORI_LABEL[r.kategori || "area"] || r.kategori;
  if (!confirm(`Hapus checklist ${kat} untuk ${r.lineNama} · ${r.lantaiNama}?\n\nData yang dihapus tidak bisa dikembalikan.`)) return;

  try {
    await deleteDoc(doc(db, "checklistSubmissions", id));
    alert("Data berhasil dihapus.");
    // Kalau yang dihapus = yang lagi diedit, cancel edit
    if (editingId === id) cancelEdit();
    loadRiwayat();
  } catch (err) {
    alert("Gagal hapus: " + err.message);
  }
};

// ---------- RIWAYAT ----------
const listRiwayat = document.getElementById("listRiwayat");
let riwayatCache = [];

async function loadRiwayat() {
  listRiwayat.innerHTML = '<div class="loading-state">Memuat data...</div>';
  try {
    const today = new Date().toISOString().slice(0, 10);
    const q = query(
      collection(db, "checklistSubmissions"),
      where("tanggal", "==", today)
    );
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
    listRiwayat.innerHTML = `
      <div class="empty-state">
        <i class="bi bi-inbox"></i>
        <p>Belum ada input hari ini.</p>
      </div>`;
    return;
  }

  listRiwayat.innerHTML = riwayatCache.map(r => {
    const tgl = r.timestamp?.toDate?.();
    const jamStr = tgl
      ? tgl.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })
      : "-";
    const total = r.items?.length || 0;
    const ok = r.items?.filter(i => i.status === "OK").length || 0;
    const nok = r.items?.filter(i => i.status === "NOK").length || 0;
    const kat = r.kategori || "area";
    const canEdit = bolehEdit(r);
    const editedTag = r.updatedAt
      ? '<span class="edited-tag"><i class="bi bi-pencil-fill"></i> diedit</span>'
      : "";

    const iconMap = {
      area: "bi-geo-alt",
      mesin: "bi-gear-wide-connected",
      alat: "bi-archive",
    };

    return `
      <div class="cl-history-item" data-kat="${kat}">
        <div class="cl-icon">
          <i class="bi ${iconMap[kat] || "bi-clipboard"}"></i>
        </div>

        <div class="cl-body" onclick="showDetail('${r.id}')" style="cursor:pointer;">
          <div class="cl-row1">
            <span class="cl-kat-badge">${KATEGORI_LABEL[kat] || kat}</span>
            ${editedTag}
          </div>
          <p class="cl-title">${escapeHtml(r.lineNama)} · ${escapeHtml(r.lantaiNama)}</p>
          <p class="cl-sub">
            Shift ${r.shift} · ${jamStr} · ${escapeHtml(r.petugasNama)}
          </p>
          <div class="cl-stats">
            <span class="stat-pill ok"><i class="bi bi-check-circle-fill"></i> ${ok}</span>
            <span class="stat-pill nok"><i class="bi bi-x-circle-fill"></i> ${nok}</span>
            <span class="stat-pill total">${total} item</span>
          </div>
        </div>

        ${canEdit ? `
          <div class="cl-actions">
            <button class="btn-action" onclick="editSubmission('${r.id}')" title="Edit">
              <i class="bi bi-pencil"></i>
            </button>
            <button class="btn-action danger" onclick="hapusSubmission('${r.id}')" title="Hapus">
              <i class="bi bi-trash"></i>
            </button>
          </div>
        ` : ""}
      </div>
    `;
  }).join("");
}

window.showDetail = (id) => {
  const r = riwayatCache.find(x => x.id === id);
  if (!r) return;
  const tgl = r.timestamp?.toDate?.();
  const waktuStr = tgl ? tgl.toLocaleString("id-ID") : "-";
  const editedStr = r.updatedAt?.toDate?.()?.toLocaleString("id-ID") || null;
  const kat = r.kategori || "area";
  const itemsHtml = (r.items || []).map(i => {
    const badge = i.status === "OK"
      ? '<span class="badge bg-success">✓ OK</span>'
      : i.status === "NOK"
      ? '<span class="badge bg-danger">✗ NOK</span>'
      : '<span class="badge bg-secondary">—</span>';
    return `<tr>
      <td>
        ${escapeHtml(i.label)}
        ${i.keterangan ? `<div class="small text-muted">${escapeHtml(i.keterangan)}</div>` : ""}
        ${i.fotoUrl ? `<div class="mt-1"><a href="${i.fotoUrl}" target="_blank"><i class="bi bi-image"></i> Foto</a></div>` : ""}
      </td>
      <td style="width:80px;">${badge}</td>
    </tr>`;
  }).join("");
  document.getElementById("modalDetailBody").innerHTML = `
    <div class="mb-3">
      <div class="fw-bold">
        <span class="badge bg-primary">${KATEGORI_LABEL[kat] || kat}</span>
        ${escapeHtml(r.lineNama)} · ${escapeHtml(r.lantaiNama)}
      </div>
      <div class="text-muted small">Shift ${r.shift} · ${waktuStr} · ${escapeHtml(r.petugasNama)}</div>
      ${editedStr ? `<div class="small text-warning mt-1"><i class="bi bi-pencil-fill"></i> Diedit: ${editedStr} oleh ${escapeHtml(r.updatedBy || "-")}</div>` : ""}
    </div>
    <table class="table table-sm mb-0">
      <thead><tr><th>Item</th><th>Status</th></tr></thead>
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