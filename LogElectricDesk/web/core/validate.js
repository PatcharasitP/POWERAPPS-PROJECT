// validate.js · ตรวจและแปลงค่าหนึ่งแถว ใช้ร่วมกันทั้งฟอร์มกรอกเองและไฟล์นำเข้า (กติกาเดียว ผลเดียว)
// ไม่มี DOM ทดสอบด้วย node ได้ (tests/validate.test.mjs)
import { FIELDS, INPUT_FIELDS, COMPANIES } from "../config.js";
import { extractSite } from "./sitecode.js";

const pad2 = (n) => String(n).padStart(2, "0");
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const iso = (y, m, d) => `${y}-${pad2(m)}-${pad2(d)}`;
const blank = (v) => v === null || v === undefined || String(v).trim() === "";

function realDate(y, m, d) {
  if (y > 2400) y -= 543; // ปี พ.ศ.
  if (y < 100) y += 2000;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  if (y < 2000 || y > 2100) return null;
  return iso(y, m, d);
}

/** แปลงค่าวันที่เป็น YYYY-MM-DD หรือ null ถ้าอ่านไม่ได้ รับ Date, เลข serial ของ Excel, YYYY-MM-DD, dd/mm/yyyy */
export function toIsoDate(v) {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : realDate(v.getFullYear(), v.getMonth() + 1, v.getDate());
  if (typeof v === "number") {
    if (!Number.isFinite(v) || v < 30000 || v > 80000) return null;
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86400000);
    return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  const s = String(v ?? "").trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(s);
  if (m) return realDate(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(s); // วัน/เดือน/ปี ตามที่ทีมใช้
  if (m) return realDate(+m[3], +m[2], +m[1]);
  m = /^(\d{1,2})[\s-]+([A-Za-z]{3,9})\.?[\s-]+(\d{2}|\d{4})$/.exec(s); // 29-Oct-2026 , 29 Oct 26 , 1 September 2026 (ไล่บัครอบ 3)
  if (m) {
    const mo = MONTHS.findIndex((x) => x.startsWith(m[2].toLowerCase().slice(0, 3)) && x.startsWith(m[2].toLowerCase()));
    if (mo >= 0) return realDate(+m[3], mo + 1, +m[1]);
  }
  return null;
}

/** ตัวเลขเงิน รับ 1,234.50 คืนตัวเลขปัด 2 ตำแหน่ง หรือ null */
export function toAmount(v) {
  if (typeof v === "number") return Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
  let s = String(v ?? "").replace(/บาท|THB/gi, "").replace(/[,\s฿]/g, "");
  const neg = /^\(.*\)$/.test(s); // (500) แบบบัญชี คือติดลบ (ไล่บัครอบ 3)
  if (neg) s = s.slice(1, -1);
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  return (neg ? -1 : 1) * Math.round(Number(s) * 100) / 100;
}

const canon = (s) => String(s ?? "").replace(/\s+/g, " ").trim().toUpperCase();

/** ข้อความ: เลขจาก Excel ไม่ให้มี .0 ต่อท้าย ตัดช่องว่างหัวท้าย */
function toText(v) {
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(v);
  if (v instanceof Date) return iso(v.getFullYear(), v.getMonth() + 1, v.getDate());
  return String(v ?? "").replace(/\s+/g, " ").trim();
}

/** ช่องที่ระบบเติม: SITE CODE NO CANDIDATE จาก SITE CODE, COMPANY NAME จาก COMPANY CODE */
export function derive(values) {
  const out = { ...values };
  const site = extractSite(values.siteCode || "", "both");
  out.siteCodeNoCand = site.noCandidate.join(", ");
  out.companyName = values.companyCode ? COMPANIES[values.companyCode] || "" : "";
  return out;
}

/**
 * ตรวจหนึ่งแถว raw = {key: ค่า} ตามคีย์ของช่อง (ไม่ใช่หัวคอลัมน์)
 * คืน { values: {key: ค่าที่แปลงแล้ว รวมช่อง AUTO}, errors: [{key, t, msg}] }
 */
export function validateRow(raw) {
  const values = {};
  const errors = [];
  const err = (f, msg) => errors.push({ key: f.key, t: f.t, msg });
  for (const f of INPUT_FIELDS) {
    const v = raw[f.key];
    if (blank(v)) {
      values[f.key] = f.kind === "num" ? null : f.kind === "date" ? null : "";
      if (f.input === "required") err(f, "Required");
      continue;
    }
    if (f.kind === "date") {
      const d = toIsoDate(v);
      if (!d) err(f, `Invalid date. Use dd/mm/yyyy, e.g. 29/10/2026 (entered: ${toText(v)})`);
      values[f.key] = d;
    } else if (f.kind === "num") {
      const n = toAmount(v);
      if (n === null) err(f, `Must be a number (entered: ${toText(v)})`);
      else if (Math.abs(n) >= 1e11) err(f, "Number is too large");
      values[f.key] = n;
    } else if (f.kind === "choice") {
      const c = canon(v);
      const hit = f.options.find((o) => canon(o) === c);
      if (!hit) err(f, `Must be one of ${f.options.join(", ")} (entered: ${toText(v)})`);
      values[f.key] = hit || toText(v);
    } else {
      const s = toText(v);
      if (f.max && s.length > f.max) err(f, `Longer than ${f.max} characters`);
      // Excel แปลงเลขยาวเป็น 5.1E+14 ตอนเซฟ CSV หรือคอลัมน์ไม่ใช่ Text เลขหลักท้ายหายไปแล้ว รับไม่ได้ (ไล่บัครอบ 3)
      else if (/^\d+(\.\d+)?E\+\d+$/i.test(s)) err(f, `Excel changed this number to scientific format (entered: ${s}). Format the column as Text, type the full number again, then save.`);
      values[f.key] = s;
    }
  }
  if (!blank(values.siteCode)) {
    const site = extractSite(values.siteCode, "both");
    if (!site.full.length) err(FIELDS.find((f) => f.key === "siteCode"), `Cannot read the site code. Use a format like BKK4874A or BKK4874 (entered: ${values.siteCode})`);
    else values.siteCode = site.full.join(", ");
  }
  return { values: derive(values), errors };
}

/** หัวคอลัมน์ในไฟล์ -> คีย์ช่อง (ไม่สนตัวเล็กใหญ่และช่องว่างซ้ำ) คืน {map: Map(หัว -> key), missing: [หัวของช่อง REQUIRED ที่ไม่มี]} */
export function mapHeader(header) {
  const want = new Map(FIELDS.map((f) => [canon(f.t), f.key]));
  const map = new Map();
  for (const hd of header) {
    const k = want.get(canon(hd));
    if (k) map.set(hd, k);
  }
  const got = new Set(map.values());
  const missing = INPUT_FIELDS.filter((f) => f.input === "required" && !got.has(f.key)).map((f) => f.t);
  return { map, missing };
}
