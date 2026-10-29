// xlsxread.js · อ่านไฟล์ Excel หรือ CSV ที่หย่อนเข้ามา (ยกมาจาก Pending VAT Desk) โหลด SheetJS ตอนใช้ครั้งแรกเท่านั้น
// โหลด SheetJS (vendor/xlsx.full.min.js รุ่น 0.20.3) ตอนใช้ครั้งแรกเท่านั้น หน้าอื่นไม่ต้องโหลด 950 KB
// หาแถวหัวตารางเอง (ไฟล์ทีมหัวอยู่แถว 4 ไฟล์ที่ดับเบิลคลิก pivot หัวอยู่แถว 1)
import { parseTable, pad2 } from "./util.js";

let loading = null;
export function loadXLSX() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = new URL("vendor/xlsx.full.min.js", document.baseURI).href;
      s.onload = () => (window.XLSX ? resolve(window.XLSX) : reject(new Error("โหลดตัวอ่าน Excel ไม่สำเร็จ")));
      s.onerror = () => { loading = null; reject(new Error("โหลดตัวอ่าน Excel ไม่สำเร็จ")); };
      document.head.append(s);
    });
  }
  return loading;
}

const cellOut = (v) => {
  if (v instanceof Date) return `${v.getFullYear()}-${pad2(v.getMonth() + 1)}-${pad2(v.getDate())}`;
  return v === undefined || v === "" ? null : v;
};

/** หาแถวหัว: แถวแรกใน 15 แถวบนที่มีคอลัมน์ที่ต้องมีครบอย่างน้อย need ตัว */
export function findHeaderRow(aoa, mustHave, need = 4) {
  const want = mustHave.map((x) => x.replace(/\s+/g, " ").trim());
  for (let i = 0; i < Math.min(15, aoa.length); i++) {
    const cells = (aoa[i] || []).map((c) => String(c ?? "").replace(/\s+/g, " ").trim());
    if (want.filter((w) => cells.includes(w)).length >= need) return i;
  }
  return -1;
}

/** rowNums[i] = เลขแถวจริงใน Excel ของ aoa[i] (เริ่ม 1) ไม่ส่ง = i + 1 ; ใส่ไว้ที่ record.__row แบบมองไม่เห็น ใช้บอกแถวที่ผิดตอนตีกลับ (รอบ 7) */
function toSheet(name, hidden, aoa, mustHave, rowNums) {
  const hr = findHeaderRow(aoa, mustHave);
  if (hr < 0) return { name, hidden, header: [], headerRow: -1, records: [] };
  const header = aoa[hr].map((c) => String(c ?? "").replace(/\s+/g, " ").trim()); // ไฟล์ทีมมี "Company  Code" เว้นสองช่อง
  const records = [];
  for (let r = hr + 1; r < aoa.length; r++) {
    const row = aoa[r] || [];
    if (row.every((c) => c === null || c === undefined || c === "")) continue;
    const o = {};
    header.forEach((k, c) => { if (k) o[k] = cellOut(row[c]); });
    Object.defineProperty(o, "__row", { value: rowNums ? rowNums[r] : r + 1, enumerable: false });
    Object.defineProperty(o, "__cells", { value: row, enumerable: false }); // ค่าดิบทุกช่องตามตำแหน่ง ไฟล์บอกจุดผิดคงคอลัมน์หัวว่างและหัวซ้ำได้ (รีวิวรอบ 8 B10)
    records.push(o);
  }
  return { name, hidden, header, headerRow: hr, headerRowNo: rowNums ? rowNums[hr] : hr + 1, records };
}

/** อ่านไฟล์ คืน {kind: "excel"|"text", sheets:[...]} (ชีทที่ไม่มีหัวตารางคืน records ว่าง) */
export async function readFile(file, mustHave) {
  const lower = file.name.toLowerCase();
  if (/\.(csv|tsv|txt)$/.test(lower)) {
    // CSV จาก Excel ภาษาไทยเซฟเป็น ANSI (windows-874) ไม่ใช่ UTF-8 อ่านแบบ UTF-8 ตรง ๆ ชื่อไทยเพี้ยนแต่ผ่านตัวตรวจ (ไล่บัครอบ 3 เห็นจริง)
    const buf = await file.arrayBuffer();
    let text;
    try { text = new TextDecoder("utf-8", { fatal: true }).decode(buf); } catch { text = new TextDecoder("windows-874").decode(buf); }
    const p = parseTable(text);
    const aoa = [p.header, ...p.records.map((o) => o.__cells)]; // ตามตำแหน่ง ไม่ใช่ตามชื่อ หัวซ้ำไม่ทับกัน หัวว่างไม่หาย
    return { kind: "text", sheets: [toSheet(file.name, false, aoa, mustHave, [1, ...p.records.map((o) => o.__row)])] };
  }
  const XLSX = await loadXLSX();
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true, dense: true });
  const meta = (wb.Workbook && wb.Workbook.Sheets) || [];
  const sheets = wb.SheetNames.map((name, i) => {
    // อ่านเป็นวัตถุตามตัวอักษรคอลัมน์ เพราะแบบนี้ SheetJS ให้เลขแถวจริง (__rowNum__) มาด้วย แบบอาร์เรย์ไม่ให้ (ทดสอบ 0.20.3)
    const ws = wb.Sheets[name];
    const rng = ws && ws["!ref"] ? XLSX.utils.decode_range(ws["!ref"]) : null;
    if (!rng) return toSheet(name, !!(meta[i] && meta[i].Hidden), [], mustHave);
    const letters = [];
    for (let c = rng.s.c; c <= rng.e.c; c++) letters.push(XLSX.utils.encode_col(c));
    const objs = XLSX.utils.sheet_to_json(ws, { header: "A", raw: true, defval: null, blankrows: false });
    const aoa = objs.map((o) => letters.map((L) => (o[L] === undefined ? null : o[L])));
    return { ...toSheet(name, !!(meta[i] && meta[i].Hidden), aoa, mustHave, objs.map((o) => o.__rowNum__ + 1)), firstCol: rng.s.c }; // คอลัมน์แรกของข้อมูล (0 = A) ใช้บอกตัวอักษรคอลัมน์ตอนหัวผิด
  });
  return { kind: "excel", sheets };
}
