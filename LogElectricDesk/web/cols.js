// cols.js · ค่าที่แสดง ค่าที่ใช้เรียง ของแต่ละคอลัมน์ (ตัวกรองแบบ Excel, ตาราง, ส่งออก ใช้ร่วมกัน)
import { colDef as def } from "./config.js";
import { money, int, dmy, dmyTime } from "./util.js";

export const colDef = (k) => {
  const c = def(k);
  return c ? { ...c, num: c.kind === "num" || c.kind === "int" } : null;
};

export function cellText(c, r) {
  const v = r[c.key];
  if (v === null || v === undefined || v === "") return "";
  if (c.kind === "date") return dmy(v);
  if (c.kind === "datetime") return dmyTime(v);
  if (c.kind === "num") return money(v);
  if (c.key === "index") return String(v); // เลข INDEX ไม่ใส่จุลภาค
  if (c.kind === "int") return int(v);
  return String(v);
}

export function sortValue(c, r) {
  const v = r[c.key];
  if (v === null || v === undefined || v === "") return null;
  if (c.kind === "num" || c.kind === "int") return Number(v);
  return String(v); // วันที่เก็บแบบ YYYY-MM-DD และ ISO เรียงตามตัวอักษรได้ตรง
}

export function compareSort(a, b) {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "th", { numeric: true });
}
