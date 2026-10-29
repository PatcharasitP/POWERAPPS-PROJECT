// exporter.js · ส่งออกแถวที่เห็นตามตัวกรองตอนนี้ ติ๊กเลือกชนิดไฟล์ (XLSX, CSV หรือทั้งสอง) และติ๊กเลือกคอลัมน์
// Member ได้แค่แถวตัวเองเสมอ เพราะแถวในหน้ามาจาก Dataverse ที่กรองตามสิทธิ์แล้ว
import { ALL_COLS } from "./config.js";
import { h, clear, int, csvCell, downloadText, stamp } from "./util.js";
import { openDialog, closeDialog } from "./ui.js";
import { cellText } from "./cols.js";
import { loadXLSX } from "./xlsxread.js";

const asDate = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ""); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : ""; };
const asDateTime = (s) => { const d = s ? new Date(s) : null; return d && !Number.isNaN(d.getTime()) ? d : ""; };

/** ค่าที่เขียนลงไฟล์ ตัวเลขเป็นตัวเลข วันที่เป็นวันที่จริงใน XLSX และ YYYY-MM-DD ใน CSV (Excel ไม่สลับวันกับเดือน) */
export function cellOut(c, r, fmt, edits) {
  if (c.key === "edits") return edits.get(r.id) || 0;
  const v = r[c.key];
  if (v === null || v === undefined || v === "") return "";
  if (c.kind === "num" || c.kind === "int") return Number(v);
  if (c.kind === "date") return fmt === "xlsx" ? asDate(v) : String(v).slice(0, 10);
  if (c.kind === "datetime") return fmt === "xlsx" ? asDateTime(v) : cellText(c, r);
  return String(v);
}

/** ข้อความที่ขึ้นต้น = + - @ Tab CR เปิดใน Excel แล้วกลายเป็นสูตร (CSV injection) ใส่ ' นำหน้า เฉพาะคอลัมน์ข้อความ ตัวเลขติดลบไม่แตะ
 *  เจอจากเทสไล่บัค D1 29/10: =HYPERLINK(...) ออกไปตรง ๆ */
export function safeText(c, v) {
  if (c.kind === "num" || c.kind === "int" || typeof v !== "string") return v;
  return /^[=+\-@\t\r]/.test(v) ? "'" + v : v;
}

export async function writeFiles({ rows, cols, formats, edits, name }) {
  if (formats.includes("csv")) {
    const lines = [cols.map((c) => csvCell(c.t)).join(",")];
    for (const r of rows) lines.push(cols.map((c) => { const v = cellOut(c, r, "csv", edits); return csvCell(c.kind === "num" && v !== "" ? v.toFixed(2) : safeText(c, v)); }).join(","));
    downloadText(`${name}.csv`, lines.join("\r\n") + "\r\n");
  }
  if (formats.includes("xlsx")) {
    const XLSX = await loadXLSX();
    const aoa = [cols.map((c) => c.t), ...rows.map((r) => cols.map((c) => cellOut(c, r, "xlsx", edits)))];
    const ws = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true });
    cols.forEach((c, i) => {
      const z = c.kind === "date" ? "dd/mm/yyyy" : c.kind === "datetime" ? "dd/mm/yyyy hh:mm" : c.kind === "num" ? "#,##0.00" : null;
      if (!z) return;
      for (let r = 1; r < aoa.length; r++) { const cell = ws[XLSX.utils.encode_cell({ r, c: i })]; if (cell && (cell.t === "n" || cell.t === "d")) cell.z = z; }
    });
    ws["!cols"] = cols.map((c, i) => ({ wch: Math.min(45, Math.max(c.t.length + 2, ...aoa.slice(1, 200).map((row) => (row[i] instanceof Date ? 16 : String(row[i] ?? "").length + 2)))) }));
    ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(0, rows.length), c: cols.length - 1 } }) };
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "LOG ELECTRIC");
    XLSX.writeFile(wb, `${name}.xlsx`, { compression: true });
  }
}

export function createExporter(app) {
  const dlg = h("dialog", { class: "dlg wide", id: "export-dlg", "aria-labelledby": "export-title" });
  document.body.append(dlg);
  let picked = new Set(ALL_COLS.map((c) => c.key));
  let formats = new Set(["xlsx"]);

  function open(rows) {
    clear(dlg);
    const cb = (checked, onchange, attrs = {}) => { const i = h("input", { type: "checkbox", ...attrs }); i.checked = checked; i.addEventListener("change", () => onchange(i.checked)); return i; };
    const go = h("button", { type: "button", class: "btn dark", id: "export-go" });
    const sync = () => {
      go.disabled = !formats.size || !picked.size || !rows.length;
      go.textContent = `Download ${int(rows.length)} rows`;
      allBox.checked = picked.size === ALL_COLS.length;
      allBox.indeterminate = picked.size > 0 && picked.size < ALL_COLS.length;
    };
    const allBox = cb(true, (v) => { picked = new Set(v ? ALL_COLS.map((c) => c.key) : []); dlg.querySelectorAll("[data-col]").forEach((x) => (x.checked = v)); sync(); }, { id: "export-all" });
    const fmtRow = h("div", { class: "row" }, ["xlsx", "csv"].map((f) => h("label", { class: "switch" },
      cb(formats.has(f), (v) => { if (v) formats.add(f); else formats.delete(f); sync(); }, { "data-fmt": f }), f === "xlsx" ? "Excel (.xlsx)" : "CSV (.csv)")));
    const colGrid = h("div", { class: "colgrid" }, ALL_COLS.map((c) => h("label", { class: "switch" },
      cb(picked.has(c.key), (v) => { if (v) picked.add(c.key); else picked.delete(c.key); sync(); }, { "data-col": c.key }), c.t)));
    go.addEventListener("click", async () => {
      const cols = ALL_COLS.filter((c) => picked.has(c.key));
      go.disabled = true;
      await writeFiles({ rows, cols, formats: [...formats], edits: app.state.edits, name: `LOG_ELECTRIC_${stamp()}` });
      closeDialog(dlg);
    });
    dlg.append(
      h("h2", { id: "export-title" }, "Export"),
      h("p", { class: "faint" }, `${int(rows.length)} rows from the current filters on the Records tab` + (app.state.role === "MEMBER" ? " (your rows only)" : "")),
      h("h3", { class: "dlg-h" }, "File type (choose one or both)"), fmtRow,
      h("h3", { class: "dlg-h" }, h("label", { class: "switch" }, allBox, "All columns")), colGrid,
      h("div", { class: "dlg-foot" }, h("button", { type: "button", class: "btn", onclick: () => closeDialog(dlg) }, "Cancel"), go));
    sync();
    openDialog(dlg);
  }
  return { open };
}
