import { db } from "./firebase-config.js";
import { protectPage } from "./guard.js";
import {
  collection, getDocs, query, where
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ---------- GUARD ----------
const user = await protectPage();

// ---------- CACHE ----------
let exportLineCache = [];
let exportLantaiCache = [];

// ---------- LOAD LINE ----------
async function loadLineForExport() {
  const snap = await getDocs(collection(db, "line"));
  exportLineCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  const sel = document.getElementById("expLine");
  const opt = exportLineCache.map(l => `<option value="${l.id}">${escapeHtml(l.nama)}</option>`).join("");
  sel.insertAdjacentHTML("beforeend", opt);
}

// ---------- LOAD LANTAI ----------
async function loadLantaiForExport() {
  const snap = await getDocs(collection(db, "lantai"));
  exportLantaiCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

document.getElementById("expLine").addEventListener("change", (e) => {
  const lineId = e.target.value;
  const sel = document.getElementById("expLantai");
  if (!lineId) {
    sel.innerHTML = '<option value="">-- Pilih Line Dulu --</option>';
    sel.disabled = true;
    return;
  }
  const data = exportLantaiCache.filter(l => l.lineId === lineId);
  sel.innerHTML = '<option value="">-- Pilih Lantai --</option>' +
    data.map(l => `<option value="${l.id}">${escapeHtml(l.nama)}</option>`).join("");
  sel.disabled = false;
});

// ---------- INIT ----------
await loadLineForExport();
await loadLantaiForExport();

// ---------- BUKA MODAL ----------
document.getElementById("btnExportExcel").addEventListener("click", () => {
  // Set default bulan = bulan ini
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  document.getElementById("expBulan").value = `${yyyy}-${mm}`;
  new bootstrap.Modal("#modalExport").show();
});

// ---------- DOWNLOAD EXCEL ----------
document.getElementById("btnDownloadExcel").addEventListener("click", async () => {
  const lineId = document.getElementById("expLine").value;
  const lantaiId = document.getElementById("expLantai").value;
  const bulan = document.getElementById("expBulan").value; // YYYY-MM
  const kategori = document.getElementById("expKategori").value;

  if (!lineId) return alert("Pilih Line dulu");
  if (!lantaiId) return alert("Pilih Lantai dulu");
  if (!bulan) return alert("Pilih Bulan dulu");

  const line = exportLineCache.find(l => l.id === lineId);
  const lantai = exportLantaiCache.find(l => l.id === lantaiId);

  const btn = document.getElementById("btnDownloadExcel");
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Generate...';

  try {
    // 1. Ambil field master (39 item)
    const fieldSnap = await getDocs(query(
      collection(db, "checklistFields"),
      where("lantaiId", "==", lantaiId),
      where("kategori", "==", kategori),
      where("aktif", "==", true)
    ));
    const fields = fieldSnap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.urutan || 0) - (b.urutan || 0));

    if (!fields.length) {
      alert(`Belum ada field checklist kategori "${kategori}" untuk lantai ini.`);
      return;
    }

    // 2. Ambil semua submission bulan itu
    const [tahun, bulanNum] = bulan.split("-");
    const totalDays = new Date(parseInt(tahun), parseInt(bulanNum), 0).getDate();

    const startDate = `${bulan}-01`;
    const endDate = `${bulan}-${String(totalDays).padStart(2, "0")}`;

    const submSnap = await getDocs(query(
      collection(db, "checklistSubmissions"),
      where("lantaiId", "==", lantaiId),
      where("kategori", "==", kategori)
    ));
    const submissions = submSnap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(s => s.tanggal >= startDate && s.tanggal <= endDate);

    // 3. Bikin map: fieldId → { tanggal → status }
    const statusMap = {};
    fields.forEach(f => { statusMap[f.id] = {}; });

    submissions.forEach(subm => {
      const tgl = subm.tanggal; // YYYY-MM-DD
      const day = parseInt(tgl.split("-")[2]); // 1-31
      (subm.items || []).forEach(item => {
        if (statusMap[item.fieldId]) {
          statusMap[item.fieldId][day] = item.status; // OK / NOK / -
        }
      });
    });

    // 4. Bikin worksheet
    const wsData = [];

    // Header row 1: PT Santos Jaya Abadi | FORM | Dokumen No
    wsData.push([
      "PT Santos Jaya Abadi", "", "", "", "FORM", "", "", "",
      "", "", "", "", "", "", "", "Dokumen No", "F/PRO/09.03", "", ""
    ]);
    wsData.push([
      "Semarang", "", "", "", "", "", "", "",
      "", "", "", "", "", "", "", "Rev. No", "00", "", ""
    ]);
    wsData.push([
      "", "", "", "", "Checklist Kebersihan", "", "", "",
      "", "", "", "", "", "", "", "Halaman No", "1/1", "", ""
    ]);
    wsData.push([
      "Dept : Produksi", "", "", "", "", "", "", "",
      "", "", "", "", "", "", "", "Berlaku Tgl", "01-09-2025", "", ""
    ]);
    wsData.push([
      "Area / Mesin : " + (line?.nama || "-") + " / " + (lantai?.nama || "-"), "",
      "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""
    ]);
    wsData.push([
      "Bulan / Tahun : " + getBulanTahun(bulan), "",
      "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""
    ]);
    wsData.push([]); // kosong

    // Header row: No | Item Checklist | Periode | 1 | 2 | ... | 31
    const headerRow = ["No", "Item Checklist", "Periode"];
    for (let d = 1; d <= totalDays; d++) headerRow.push(String(d));
    wsData.push(headerRow);

    // Baris item
    fields.forEach((f, idx) => {
      const row = [idx + 1, f.label, "Harian"];
      for (let d = 1; d <= totalDays; d++) {
        const st = statusMap[f.id]?.[d];
        let symbol = "-";
        if (st === "OK") symbol = "V";
        else if (st === "NOK") symbol = "X";
        row.push(symbol);
      }
      wsData.push(row);
    });

    // TTD row
    wsData.push([]);
    const ttdRow = ["TTD PIC :", "", "VERIFIKATOR :"];
    wsData.push(ttdRow);
    wsData.push([]);
    wsData.push(["Mengetahui,", "", "Catatan:", "", "", "", "", "", "", "", "", "", "", "", "", "Keterangan Tanda :", "", "", ""]);
    wsData.push(["", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "V = OKI", "", "", ""]);
    wsData.push(["", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "X = TIDAK OKE", "", "", ""]);
    wsData.push(["", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "- = Bukan jadwal pemberishan", "", "", ""]);

    // 5. Bikin worksheet
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // 6. Set column widths
    ws["!cols"] = [
      { wch: 4 },   // No
      { wch: 45 },  // Item Checklist
      { wch: 10 },  // Periode
    ];
    for (let d = 1; d <= totalDays; d++) ws["!cols"].push({ wch: 4 });

    // 7. Merge cells
    ws["!merges"] = [
      // Header title
      { s: { r: 0, c: 0 }, e: { r: 0, c: 3 } },   // PT Santos
      { s: { r: 1, c: 0 }, e: { r: 1, c: 3 } },   // Semarang
      { s: { r: 2, c: 4 }, e: { r: 2, c: 9 } },   // FORM
      { s: { r: 2, c: 2 }, e: { r: 2, c: 3 } },   // (placeholder)
      // Info baris
      { s: { r: 4, c: 0 }, e: { r: 4, c: 8 } },   // Area/Mesin
      { s: { r: 5, c: 0 }, e: { r: 5, c: 8 } },   // Bulan/Tahun
      // TTD
      { s: { r: wsData.length - 5, c: 0 }, e: { r: wsData.length - 5, c: 1 } }, // TTD PIC
    ];

    // 8. Style header (row 7)
    const headerRowIdx = 7; // 0-indexed (baris ke-8 di wsData)
    for (let c = 0; c < headerRow.length; c++) {
      const cell = XLSX.utils.encode_cell({ r: headerRowIdx, c });
      if (!ws[cell]) continue;
      ws[cell].s = {
        font: { bold: true, sz: 10 },
        fill: { fgColor: { rgb: "4472C4" } },
        alignment: { horizontal: "center", vertical: "center" },
        border: {
          top: { style: "thin", color: { rgb: "000000" } },
          bottom: { style: "thin", color: { rgb: "000000" } },
          left: { style: "thin", color: { rgb: "000000" } },
          right: { style: "thin", color: { rgb: "000000" } },
        },
      };
      ws[cell].s.font.color = { rgb: "FFFFFF" };
    }

    // 9. Style data cells
    for (let r = headerRowIdx + 1; r < headerRowIdx + 1 + fields.length; r++) {
      // Kolom 0 (No), 1 (Item), 2 (Periode)
      for (let c = 0; c <= 2; c++) {
        const cell = XLSX.utils.encode_cell({ r, c });
        if (!ws[cell]) continue;
        ws[cell].s = {
          alignment: {
            horizontal: c === 1 ? "left" : "center",
            vertical: "center",
            wrapText: true,
          },
          border: {
            top: { style: "thin", color: { rgb: "000000" } },
            bottom: { style: "thin", color: { rgb: "000000" } },
            left: { style: "thin", color: { rgb: "000000" } },
            right: { style: "thin", color: { rgb: "000000" } },
          },
          font: { sz: 9 },
        };
      }

      // Kolom tanggal
      for (let c = 3; c < 3 + totalDays; c++) {
        const cell = XLSX.utils.encode_cell({ r, c });
        if (!ws[cell]) continue;
        const val = ws[cell].v;
        let bgColor = "FFFFFF";
        if (val === "V") bgColor = "C6EFCE";
        else if (val === "X") bgColor = "FFC7CE";
        else if (val === "-") bgColor = "E2E3E5";

        ws[cell].s = {
          alignment: { horizontal: "center", vertical: "center" },
          fill: { fgColor: { rgb: bgColor } },
          font: { sz: 9, bold: val === "X" },
          border: {
            top: { style: "thin", color: { rgb: "000000" } },
            bottom: { style: "thin", color: { rgb: "000000" } },
            left: { style: "thin", color: { rgb: "000000" } },
            right: { style: "thin", color: { rgb: "000000" } },
          },
        };
      }
    }

    // 10. Style title header
    for (let r = 0; r <= 5; r++) {
      for (let c = 0; c <= 18; c++) {
        const cell = XLSX.utils.encode_cell({ r, c });
        if (!ws[cell]) continue;
        ws[cell].s = {
          ...ws[cell].s,
          font: { sz: 9, bold: r === 2 && c === 4 },
          alignment: { horizontal: "left", vertical: "center" },
        };
      }
    }

    // 11. Row heights
    ws["!rows"] = [];
    ws["!rows"][2] = { hpt: 20 }; // FORM row
    ws["!rows"][headerRowIdx] = { hpt: 22 };
    for (let r = headerRowIdx + 1; r < headerRowIdx + 1 + fields.length; r++) {
      ws["!rows"][r] = { hpt: 25 };
    }

    // 12. Bikin workbook & download
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Checklist");
    const fileName = `Checklist_${kategori}_${line?.nama}_${lantai?.nama}_${bulan}.xlsx`;
    XLSX.writeFile(wb, fileName);

    alert("Excel berhasil didownload ✅");
    bootstrap.Modal.getInstance(document.getElementById("modalExport")).hide();
  } catch (err) {
    console.error(err);
    alert("Gagal export: " + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-download"></i> Download Excel';
  }
});

// ---------- UTIL ----------
function getBulanTahun(yyyymm) {
  const [y, m] = yyyymm.split("-");
  const bulan = ["Januari","Februari","Maret","April","Mei","Juni",
                 "Juli","Agustus","September","Oktober","November","Desember"];
  return `${bulan[parseInt(m) - 1]} ${y}`;
}

function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}