// util.js · ตัวช่วยทั่วไปของหน้าจอ (ยกมาจาก Pending VAT Desk ตัดส่วนเฉพาะ VAT ออก)

/** สร้างอิลิเมนต์: h("div", {class:"x", onclick: fn}, "ข้อความ", child) */
export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "dataset") Object.assign(el.dataset, v);
      else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (v === true) el.setAttribute(k, "");
      else el.setAttribute(k, v);
    }
  }
  append(el, kids);
  return el;
}
export function append(el, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k === null || k === undefined || k === false) continue;
    el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
  return el;
}
export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

const nf2 = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nf0 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
export const money = (n) => { const v = Number(n); return nf2.format(Number.isFinite(v) ? v : 0); };
export const int = (n) => { const v = Number(n); return nf0.format(Number.isFinite(v) ? v : 0); };
/** ย่อเงินก้อนใหญ่ 1.25M 830K */
export function short(n) {
  const v = Number(n) || 0, a = Math.abs(v);
  if (a >= 1e6) return (v / 1e6).toFixed(a >= 1e7 ? 1 : 2) + "M";
  if (a >= 1e3) return (v / 1e3).toFixed(a >= 1e4 ? 0 : 1) + "K";
  return nf0.format(v);
}
export const pad2 = (n) => String(n).padStart(2, "0");
export const ymd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
export const today = () => ymd(new Date());
/** YYYY-MM-DD -> dd/mm/yyyy */
export function dmy(s) { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ""); return m ? `${m[3]}/${m[2]}/${m[1]}` : ""; }
/** วันเวลา ISO -> dd/mm/yyyy HH:mm เวลาเครื่อง */
export function dmyTime(s) {
  if (!s) return "";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? "" : `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
export function csvCell(v) {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\r\n]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function save(blob, name) {
  const a = h("a", { href: URL.createObjectURL(blob), download: name });
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
export function downloadText(name, text, mime = "text/csv;charset=utf-8") { save(new Blob(["﻿" + text], { type: mime }), name); }
export function downloadBytes(name, bytes, mime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") { save(new Blob([bytes], { type: mime }), name); }
export function downloadB64(name, b64, mime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") {
  const bin = atob(b64), buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  save(new Blob([buf], { type: mime }), name);
}
export const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
export const stamp = () => { const d = new Date(); return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}_${pad2(d.getHours())}${pad2(d.getMinutes())}`; };
/**
 * แยกข้อความตารางเป็นแถว (คืน {delimiter, header, records:[{หัว: ค่า}]})
 * รองรับเครื่องหมายคำพูดแบบ Excel ("" แทน ") ตัวคั่น Tab ก่อน ไม่มี Tab ในบรรทัดหัวใช้ลูกน้ำ
 */
export function parseTable(text) {
  const src = String(text ?? "").replace(/^﻿/, "");
  const firstLine = src.slice(0, src.search(/\r?\n|$/));
  const delimiter = firstLine.includes("\t") ? "\t" : ",";
  const rows = [];
  let row = [], cell = "", q = false, i = 0;
  const n = src.length;
  while (i < n) {
    const ch = src[i];
    if (q) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cell += '"'; i += 2; continue; }
        q = false; i++; continue;
      }
      cell += ch; i++; continue;
    }
    if (ch === '"' && cell === "") { q = true; i++; continue; }
    if (ch === delimiter) { row.push(cell); cell = ""; i++; continue; }
    if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      rows.push(row); row = [];
      i++; continue;
    }
    cell += ch; i++;
  }
  if (cell !== "" || row.length > 0) { row.push(cell); rows.push(row); }
  while (rows.length && rows[rows.length - 1].every((c) => c === "")) rows.pop();
  if (rows.length === 0) return { delimiter, header: [], records: [] };
  const header = rows[0].map((c) => c.trim());
  const records = [];
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    if (cells.every((c) => c.trim() === "")) continue;
    const o = {};
    for (let c = 0; c < header.length; c++) {
      if (header[c] === "") continue;
      const v = cells[c] === undefined ? "" : cells[c];
      o[header[c]] = v === "" ? null : v;
    }
    // เลขแถวแบบ Excel (หัว = 1 นับบรรทัดว่างด้วย เซลล์หลายบรรทัดในเครื่องหมายคำพูดนับเป็นแถวเดียว) มองไม่เห็นตอนวนคีย์ ใช้บอกแถวที่ผิด (รีวิวรอบ 7)
    Object.defineProperty(o, "__row", { value: r + 1, enumerable: false });
    Object.defineProperty(o, "__cells", { value: cells.map((v) => (v === "" ? null : v)), enumerable: false }); // ค่าดิบตามตำแหน่ง ไฟล์บอกจุดผิดคงคอลัมน์หัวว่างและหัวซ้ำ (รีวิวรอบ 10 I1 I2)
    records.push(o);
  }
  return { delimiter, header, records };
}

