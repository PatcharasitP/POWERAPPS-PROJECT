// importer.js · นำเข้าไฟล์จากเทมเพลต: ตรวจทุกแถวก่อน ผิดแม้แถวเดียวไม่รับทั้งไฟล์ ส่งไฟล์ error กลับ (บอกแถว คอลัมน์ และค่าที่ผิด)
// ถูกทั้งไฟล์ ให้ดูสรุปก่อนกดยืนยัน แล้วเขียนก้อนละ 100 แถว
import { INPUT_FIELDS, TEMPLATE_SHEET, TEMPLATE_EXAMPLE } from "./config.js";
import { h, clear, int, money, downloadB64, downloadBytes } from "./util.js";
import { icon, confirmBox } from "./ui.js";
import { readFile, loadXLSX } from "./xlsxread.js";
import { validateRow, mapHeader } from "./core/validate.js";
import { styleErrorBook } from "./core/xlsxstyle.js";
import { TEMPLATE_B64, TEMPLATE_NAME } from "./template.js";
import * as dv from "./dv.js";

/** 1 row , 2 rows */
const nRows = (n) => `${int(n)} row${n === 1 ? "" : "s"}`;
/**
 * การ์ดเตือนแถวซ้ำกับในตาราง ขึ้นทุกครั้งที่เจอ แม้ซ้ำแถวเดียวจากหลายแถว บอกกี่แถวจากทั้งหมดและแถวไหน (พี่ปอนด์ 30/10 ภาพ #77 #78)
 * ซ้ำทุกแถวเปลี่ยนหัวเป็นถามว่าอัปโหลดไฟล์เดิมซ้ำหรือเปล่า
 */
export function dupCard(dupRows, total) {
  const n = dupRows.length;
  if (n === total) return { title: "Everything in this file is already in the table", body: `Did you upload this file before? Importing will add ${nRows(n)} again.` };
  const list = dupRows.slice(0, 10).join(", ") + (n > 10 ? ` and ${int(n - 10)} more` : "");
  return { title: `${int(n)} of ${int(total)} rows ${n === 1 ? "is" : "are"} already in the table`,
    body: `${n === 1 ? "Row" : "Rows"} ${list}. Importing will add ${n === 1 ? "it" : "them"} again.` };
}
/** บอกจำนวนแถวที่จะนำเข้า แทน rows 2 to 2 ที่อ่านแล้วงง (พี่ปอนด์ 30/10 ภาพ #80) */
export const sheetLine = (sheet, n, owner) => `Sheet ${sheet}, ${nRows(n)} to import. Imported rows will belong to ${owner}.`;
const REQUIRED_HEADS = INPUT_FIELDS.filter((f) => f.input === "required").map((f) => f.t);
const EXAMPLE = validateRow(TEMPLATE_EXAMPLE).values;
const isExample = (v) => INPUT_FIELDS.every((f) => String(v[f.key] ?? "") === String(EXAMPLE[f.key] ?? ""));

/** ตรวจทั้งไฟล์ คืน { sheet, rows: [{row, values}], bad: Map(แถว -> [ข้อความ]), badKeys: Map(แถว -> [ช่องที่ผิด]), missing, example: [แถวตัวอย่างที่ข้าม] } ไม่มี DOM (ทดสอบได้) */
export function checkSheet(sheet) {
  const { map, missing } = mapHeader(sheet.header);
  const rows = [], bad = new Map(), badKeys = new Map(), example = [];
  if (missing.length) return { sheet, rows, bad, badKeys, missing, example };
  for (const rec of sheet.records) {
    const raw = {};
    for (const [hd, key] of map) raw[key] = rec[hd];
    const { values, errors } = validateRow(raw);
    if (errors.length) { bad.set(rec.__row, errors.map((e) => `${e.t}: ${e.msg}`)); badKeys.set(rec.__row, errors.map((e) => e.key)); }
    else if (isExample(values)) example.push(rec.__row);
    else rows.push({ row: rec.__row, values });
  }
  return { sheet, rows, bad, badKeys, missing, example };
}

/** ไฟล์ error: ไฟล์เดิมทุกแถวที่ตำแหน่งแถวเดิม + คอลัมน์ ERROR (แบบไฟล์ error ของ Dataverse) แก้ในไฟล์นี้แล้วอัปโหลดกลับได้เลย */
export async function downloadErrorFile(fileName, sheet, bad, badKeys = new Map()) {
  const XLSX = await loadXLSX();
  const header = sheet.header.map((k) => k ?? "");
  const width = Math.max(header.length, ...sheet.records.map((r) => r.__cells.length));
  const pad = (a) => { const o = a.slice(0, width); while (o.length < width) o.push(null); return o; };
  const aoa = [];
  const hRow = sheet.headerRowNo || 1;
  aoa[hRow - 1] = [...pad(header), "ERROR"];
  for (const rec of sheet.records) {
    const msgs = bad.get(rec.__row);
    aoa[rec.__row - 1] = [...pad(rec.__cells.map((v) => (v instanceof Date ? new Date(Math.round(v.getTime() / 1000) * 1000) : v ?? null))), msgs ? `Row ${rec.__row}: ${msgs.join(" | ")}` : null];
  }
  for (let i = 0; i < aoa.length; i++) if (!aoa[i]) aoa[i] = [];
  const ws = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true });
  header.forEach((t, i) => {
    const f = INPUT_FIELDS.find((x) => x.t === String(t).trim().toUpperCase());
    if (f && f.kind === "date") for (let r = hRow; r < aoa.length; r++) { const c = ws[XLSX.utils.encode_cell({ r, c: i })]; if (c && c.t === "d") c.z = "dd/mm/yyyy"; }
  });
  ws["!cols"] = [...pad(header).map((t) => ({ wch: Math.min(30, Math.max(10, String(t ?? "").length + 2)) })), { wch: 90 }];
  ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: hRow - 1, c: 0 }, e: { r: aoa.length - 1, c: width } }) };
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, String(sheet.name || TEMPLATE_SHEET).replace(/[\\/?*[\]:]/g, " ").slice(0, 31));
  // ลงสี: หัวคอลัมน์แบบเทมเพลต , คอลัมน์ ERROR แดง , ช่องที่ผิดแดงอ่อน (พี่ปอนด์ 29/10 รอบ 4)
  const { map } = mapHeader(sheet.header);
  const colOf = new Map([...map].map(([hd, key]) => [key, sheet.header.indexOf(hd)]));
  const heads = new Map([...map].map(([hd, key]) => [sheet.header.indexOf(hd), INPUT_FIELDS.find((f) => f.key === key)?.input === "required" ? "required" : "optional"]));
  const cells = new Map([...badKeys].map(([row, keys]) => [row, new Set(keys.map((k) => colOf.get(k)).filter((c) => c >= 0))]));
  for (const row of bad.keys()) if (!cells.has(row)) cells.set(row, new Set());
  const raw = new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx", compression: true }));
  let out = raw;
  try { out = styleErrorBook(XLSX, raw, { headerRow: hRow, errCol: width, cells, heads }); } catch (e) { console.warn("ลงสีไฟล์ error ไม่ได้ ส่งไฟล์ไม่มีสีแทน", e); }
  downloadBytes(`${String(fileName).replace(/\.[^.]+$/, "")}_errors.xlsx`, out);
}

/** การ์ดฉลองนำเข้าสำเร็จ: เครื่องหมายถูกวาดเส้นขึ้น กระดาษสีฟ้า แดง เหลือง เขียวพุ่งออก (พี่ปอนด์ 29/10 รอบ 4 "ให้ดูสำเร็จ แบบเยี่ยมเข้าไปแล้ว") */
const CONFETTI = ["#1BA7E1", "#E00000", "#FFC21A", "#2E8B57"];
export function celebrate(title, sub, onView) {
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 64 64"); svg.setAttribute("class", "done-check"); svg.setAttribute("aria-hidden", "true");
  for (const [tag, attrs] of [["circle", { cx: 32, cy: 32, r: 28, class: "ring" }], ["path", { d: "M19 33 L28 42 L46 23", class: "tick" }]]) {
    const el = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    svg.append(el);
  }
  const bits = Array.from({ length: 18 }, (_, i) => {
    const a = (i / 18) * Math.PI * 2 + (i % 2 ? 0.15 : -0.1), d = 70 + (i % 3) * 28;
    return h("i", { style: `--x:${Math.round(Math.cos(a) * d * 1.6)}px;--y:${Math.round(Math.sin(a) * d)}px;--r:${(i * 67) % 360}deg;--c:${CONFETTI[i % 4]};--d:${(i % 5) * 30}ms` });
  });
  return h("div", { class: "card done", id: "imp-done", role: "status" }, h("div", { class: "confetti", "aria-hidden": "true" }, bits), svg,
    h("b", { class: "done-title" }, title), h("p", { class: "faint" }, sub),
    h("button", { type: "button", class: "btn dark", id: "imp-view", onclick: onView }, icon("table", 16), "View records"));
}

export function createImporter(app) {
  const { state, toast } = app;
  const root = h("section", { id: "import", class: "page narrow" });
  const out = h("div", { id: "imp-result", "aria-live": "polite" });
  const input = h("input", { type: "file", id: "imp-file", accept: ".xlsx,.xls,.xlsm,.csv", hidden: true });
  const drop = h("label", { class: "drop", for: "imp-file", id: "imp-drop", tabindex: "0" },
    icon("upload", 28), h("b", null, "Drop a file here or click to choose"), h("span", { class: "faint" }, "Template file .xlsx or .csv"));
  drop.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); } });
  for (const ev of ["dragover", "dragenter"]) drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); });
  for (const ev of ["dragleave", "drop"]) drop.addEventListener(ev, () => drop.classList.remove("over"));
  drop.addEventListener("drop", (e) => { e.preventDefault(); if (e.dataTransfer.files[0]) handle(e.dataTransfer.files[0]); });
  input.addEventListener("change", () => { if (input.files[0]) handle(input.files[0]); input.value = ""; });

  root.append(
    h("div", { class: "steps" },
      h("div", { class: "step" }, h("span", { class: "step-n" }, "01"), h("div", null, h("b", null, "Download template"),
        h("p", { class: "faint" }, "Only the columns you need to fill in."),
        h("button", { type: "button", class: "btn", id: "btn-template", onclick: () => downloadB64(TEMPLATE_NAME, TEMPLATE_B64) }, icon("file", 16), "Download template"))),
      h("div", { class: "step" }, h("span", { class: "step-n" }, "02"), h("div", null, h("b", null, "Fill in and upload"),
        h("p", { class: "faint" }, "If any row is wrong, the whole file is rejected and you get an error file showing the row, column and value."), drop, input))),
    out);

  async function handle(file) {
    clear(out).append(h("div", { class: "faint" }, `Reading ${file.name}`));
    let book;
    try { book = await readFile(file, REQUIRED_HEADS); } catch (e) { clear(out).append(h("div", { class: "card err" }, "Cannot read the file: " + e.message)); return; }
    const sheet = book.sheets.find((s) => s.headerRow >= 0 && s.name === TEMPLATE_SHEET) || book.sheets.find((s) => s.headerRow >= 0 && !s.hidden);
    if (!sheet) {
      clear(out).append(h("div", { class: "card err", id: "imp-noheader" }, h("b", null, "Template headers not found"),
        h("p", null, "The file needs these headers: " + REQUIRED_HEADS.join(", ") + ". Use the file from Download template.")));
      return;
    }
    const res = checkSheet(sheet);
    if (res.missing.length) {
      clear(out).append(h("div", { class: "card err", id: "imp-missing" }, h("b", null, "Missing required columns"), h("p", null, res.missing.join(", "))));
      return;
    }
    if (!sheet.records.length) { clear(out).append(h("div", { class: "card err", id: "imp-empty" }, "The file has no data rows")); return; }
    if (res.bad.size) {
      const byCol = new Map();
      for (const msgs of res.bad.values()) for (const m of msgs) { const c = m.split(":")[0]; byCol.set(c, (byCol.get(c) || 0) + 1); }
      const again = () => downloadErrorFile(file.name, sheet, res.bad, res.badKeys);
      clear(out).append(h("div", { class: "card err", id: "imp-rejected" },
        h("b", null, `File rejected: ${int(res.bad.size)} of ${int(sheet.records.length)} rows have errors. Nothing was saved.`),
        h("p", null, "The error file has been downloaded. Fix the rows using the ERROR column at the end, then upload that file again."),
        h("table", { class: "mini" }, h("tr", null, h("th", null, "Column"), h("th", { class: "num" }, "Rows with errors")),
          [...byCol].sort((a, b) => b[1] - a[1]).map(([c, n]) => h("tr", null, h("td", null, c), h("td", { class: "num" }, int(n))))),
        h("ul", { class: "errlist" }, [...res.bad].slice(0, 8).map(([row, msgs]) => h("li", null, `Row ${row}: ${msgs.join(" | ")}`))),
        h("button", { type: "button", class: "btn primary", id: "btn-errfile", onclick: again }, icon("download", 16), "Download error file again")));
      await again();
      return;
    }
    // ไฟล์ที่ส่งออกจากแอปเอง (มีค่า INDEX) อัปโหลดกลับจะได้แถวซ้ำทั้งก้อน Import เพิ่มแถวใหม่อย่างเดียว (เทสไล่บัค A10 29/10)
    const idxHead = sheet.header.find((x) => String(x || "").trim().toUpperCase() === "INDEX");
    if (idxHead && sheet.records.some((r) => r[idxHead] !== null && r[idxHead] !== undefined && String(r[idxHead]).trim() !== "")) {
      clear(out).append(h("div", { class: "card err", id: "imp-export" }, h("b", null, "This looks like a file exported from the app"),
        h("p", null, "It has INDEX values, so these rows already exist. Import only adds new rows, and they would be duplicated."),
        h("p", { class: "faint" }, "To change existing rows, edit them on the Records tab. To add new rows, use Download template.")));
      return;
    }
    if (!res.rows.length) {
      clear(out).append(h("div", { class: "card err", id: "imp-only-example" }, h("b", null, "The file only has the example row"),
        h("p", null, "Replace the example in row 2 with your own data, then upload again.")));
      return;
    }
    // แถวที่หน้าตาตรงกับแถวในตารางแล้ว เตือนแต่ไม่บล็อก (ยังไม่รู้ว่าทีมมีรายการแบบนี้ซ้ำจริงไหม)
    const key = (v) => [v.logBookDate, String(v.proNumber).trim().toUpperCase(), v.siteCode, Number(v.amount).toFixed(2)].join("|");
    const have = new Set(state.rows.map(key));
    const dup = res.rows.filter((r) => have.has(key(r.values)));
    const total = res.rows.reduce((a, r) => a + (r.values.amount || 0), 0);
    // ซ้ำทุกแถว เตือนแยกให้เห็นชัด น่าจะอัปโหลดไฟล์เดิมซ้ำ ปุ่มเป็นปุ่มธรรมดา (พี่ปอนด์ 29/10)
    const allDup = dup.length > 0 && dup.length === res.rows.length;
    const card = dupCard(dup.map((r) => r.row), res.rows.length);
    const go = h("button", { type: "button", class: allDup ? "btn" : "btn primary", id: "btn-confirm-import" }, `${allDup ? "Import anyway" : "Import"} ${nRows(res.rows.length)}`);
    const bar = h("progress", { max: res.rows.length, value: 0, hidden: true, id: "imp-progress" });
    clear(out).append(h("div", { class: "card ok", id: "imp-ready" },
      h("b", null, `${res.rows.length === 1 ? "1 row is valid" : `All ${int(res.rows.length)} rows are valid`}. AMOUNT total ${money(total)}`),
      h("p", { class: "faint" }, sheetLine(sheet.name, res.rows.length, state.user.name)),
      res.example.length ? h("p", { class: "faint", id: "imp-example" }, `Row ${res.example.join(", ")} is the example from the template and will be skipped.`) : null,
      dup.length ? h("div", { class: "alldup", id: allDup ? "imp-alldup" : "imp-dup", role: "alert" }, icon("alert", 20),
        h("div", null, h("b", null, card.title), h("p", null, card.body))) : null,
      h("div", { class: "row" }, go, bar)));
    go.addEventListener("click", async () => {
      if (!(await confirmBox(document.body, { title: allDup ? "Import duplicates?" : "Confirm import",
        body: allDup ? `All ${nRows(res.rows.length)} from ${file.name} are already in the table. They will be added again.` : `${nRows(res.rows.length)} from ${file.name}${dup.length ? `. ${int(dup.length)} of them ${dup.length === 1 ? "is" : "are"} already in the table.` : ""}`,
        ok: allDup ? "Import anyway" : "Import", cancel: "Cancel" }))) return;
      go.disabled = true; bar.hidden = false;
      const source = file.name.slice(0, 200);
      try {
        await dv.createMany(res.rows.map((r) => r.values), source, (n) => { bar.value = n; go.textContent = `Saving ${int(n)} / ${int(res.rows.length)}`; });
        const done = `Imported ${nRows(res.rows.length)}`;
        clear(out).append(celebrate(done, `Great job! Every row now has an INDEX. AMOUNT total ${money(total)}`, () => app.go("records")));
        toast.show(done, { kind: "success" });
        await app.reload();
      } catch (e) {
        clear(out).append(h("div", { class: "card err", id: "imp-failed" }, h("b", null, `Import incomplete: ${nRows(e.done || 0)} saved`),
          h("p", null, e.message), h("p", { class: "faint" }, `Saved rows have SOURCE = ${source}. Filter by it on the Records tab.`)));
        await app.reload();
      }
    });
  }
  return { el: root };
}
