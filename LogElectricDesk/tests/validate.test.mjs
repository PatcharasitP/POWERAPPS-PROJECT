// ตัวตรวจแถว: เคสผิดทุกชนิดต้องโดนจับพร้อมชื่อคอลัมน์ เคสถูกต้องผ่านและแปลงค่าถูก
import test from "node:test";
import assert from "node:assert/strict";
import { validateRow, toIsoDate, toAmount, mapHeader } from "../web/core/validate.js";
import { INPUT_FIELDS, FIELDS } from "../web/config.js";

const GOOD = {
  logBookDate: "29/10/2026", proNumber: 5100012345, siteCode: "bkk4874a", name: "บริษัท ตัวอย่าง จำกัด",
  dueDate: new Date(2026, 10, 13), amount: "2,020.16", paymentMethod: "bank transfer", accountant: "Accountant A",
  requestor: "Requestor B", team: "ibc", system: "Site Rental", companyCode: 1068, remark: "",
};
const cols = (r) => r.errors.map((e) => e.key).sort();

test("แถวถูกต้อง ผ่านและแปลงค่า", () => {
  const r = validateRow(GOOD);
  assert.deepEqual(r.errors, []);
  assert.equal(r.values.logBookDate, "2026-10-29");
  assert.equal(r.values.dueDate, "2026-11-13");
  assert.equal(r.values.amount, 2020.16);
  assert.equal(r.values.proNumber, "5100012345");
  assert.equal(r.values.siteCode, "BKK4874A");
  assert.equal(r.values.siteCodeNoCand, "BKK4874");
  assert.equal(r.values.paymentMethod, "BANK TRANSFER");
  assert.equal(r.values.team, "IBC");
  assert.equal(r.values.system, "SITE RENTAL");
  assert.equal(r.values.companyCode, "1068");
  assert.equal(r.values.companyName, "TRUE MOVE H UNIVERSAL COMMUNICATION CO., LTD.");
});

test("ช่อง REQUIRED ว่างทุกช่อง โดนจับครบ ช่องว่างได้ไม่โดน", () => {
  const r = validateRow({});
  const req = INPUT_FIELDS.filter((f) => f.input === "required").map((f) => f.key).sort();
  assert.deepEqual(cols(r), req);
  assert.ok(!cols(r).includes("remark") && !cols(r).includes("companyCode"));
});

test("ค่าผิดชนิด โดนจับที่คอลัมน์นั้นพร้อมค่าที่ใส่", () => {
  const r = validateRow({ ...GOOD, amount: "abc", dueDate: "31/02/2026", team: "DTAC", siteCode: "หาไม่เจอ", companyCode: "9999" });
  assert.deepEqual(cols(r), ["amount", "companyCode", "dueDate", "siteCode", "team"]);
  assert.match(r.errors.find((e) => e.key === "team").msg, /DTAC/);
  assert.match(r.errors.find((e) => e.key === "amount").msg, /abc/);
});

test("ข้อความยาวเกิน โดนจับ", () => {
  const r = validateRow({ ...GOOD, name: "ก".repeat(201) });
  assert.deepEqual(cols(r), ["name"]);
});

test("วันที่หลายแบบ", () => {
  assert.equal(toIsoDate("2026-10-29"), "2026-10-29");
  assert.equal(toIsoDate("29/10/2569"), "2026-10-29"); // พ.ศ.
  assert.equal(toIsoDate("1/2/26"), "2026-02-01");
  assert.equal(toIsoDate(46324), "2026-10-29"); // serial ของ Excel
  assert.equal(toIsoDate("10/29/2026"), null); // เดือน 29 ไม่มี (กันสลับวันเดือน)
  assert.equal(toIsoDate("hello"), null);
});

test("เงิน", () => {
  assert.equal(toAmount("1,234.567"), 1234.57);
  assert.equal(toAmount("-50"), -50);
  assert.equal(toAmount("12a"), null);
});

test("หัวคอลัมน์: ขาดช่อง REQUIRED แจ้ง, ขาดช่องว่างได้ไม่แจ้ง, ช่อง AUTO ในไฟล์ไม่เป็นไร", () => {
  const all = FIELDS.map((f) => f.t.toLowerCase());
  assert.deepEqual(mapHeader(all).missing, []);
  const noAmount = INPUT_FIELDS.filter((f) => f.key !== "amount" && f.key !== "remark").map((f) => f.t);
  assert.deepEqual(mapHeader(noAmount).missing, ["AMOUNT"]);
});

import { readFileSync } from "node:fs";
test("หน้าโหลดเหลือแค่สายฟ้า ไม่มีตัวการ์ตูน (พี่ปอนด์ 29/10) SVG ในไฟล์ขึ้นก่อน JS โหลด และหยุดขยับเมื่อผู้ใช้ปิดภาพเคลื่อนไหว", () => {
  const html = readFileSync(new URL("../web/index.html", import.meta.url), "utf8");
  const css = readFileSync(new URL("../web/styles.css", import.meta.url), "utf8");
  const svg = html.match(/<svg class="mascot"[\s\S]*?<\/svg>/)[0];
  assert.match(svg, /class="bolt"/);
  assert.doesNotMatch(svg, /class="(body|eyes|cheek|heart|fist[^"]*)"/, "ไม่มีส่วนของตัวการ์ตูนเหลือ");
  assert.match(css, /prefers-reduced-motion: reduce\) \{ \.mascot \*/);
});

import { checkSheet } from "../web/importer.js";
import { TEMPLATE_EXAMPLE } from "../web/config.js";
test("แถวตัวอย่างในเทมเพลต (แถว 2) ถูกข้าม ไม่นำเข้า แถวจริงยังเข้า และแถวที่แก้ค่าแม้ช่องเดียวไม่ถูกข้าม", () => {
  const head = INPUT_FIELDS.map((f) => f.t);
  const rec = (row, vals) => ({ __row: row, ...Object.fromEntries(INPUT_FIELDS.map((f) => [f.t, vals[f.key] ?? null])) });
  const ex = { ...TEMPLATE_EXAMPLE, amount: Number(TEMPLATE_EXAMPLE.amount) };
  const r = checkSheet({ header: head, records: [rec(2, ex), rec(3, GOOD), rec(4, { ...ex, amount: 99 })] });
  assert.deepEqual(r.example, [2]);
  assert.deepEqual(r.rows.map((x) => x.row), [3, 4]);
  assert.equal(r.bad.size, 0);
});

test("ไล่บัครอบ 3: เงินแบบที่ลูกทีมพิมพ์จริง บาท THB วงเล็บติดลบ", () => {
  assert.equal(toAmount("1,234.50 บาท"), 1234.5);
  assert.equal(toAmount("THB 20"), 20);
  assert.equal(toAmount("(500.25)"), -500.25);
  assert.equal(toAmount("฿ 1,000"), 1000);
  assert.equal(toAmount("12 34"), 1234); // ช่องว่างคั่นหลักพัน
  assert.equal(toAmount("บาท"), null);
});

test("ไล่บัครอบ 3: วันที่มีชื่อเดือนภาษาอังกฤษ", () => {
  assert.equal(toIsoDate("29-Oct-2026"), "2026-10-29");
  assert.equal(toIsoDate("29 Oct 2026"), "2026-10-29");
  assert.equal(toIsoDate("29-Oct-26"), "2026-10-29");
  assert.equal(toIsoDate("1 September 2026"), "2026-09-01");
  assert.equal(toIsoDate("31-Feb-2026"), null);
  assert.equal(toIsoDate("29-Okt-2026"), null);
});

test("ไล่บัครอบ 3: เลขที่ Excel แปลงเป็น E+ ถูกตีกลับพร้อมบอกวิธีแก้ ไม่รับค่าที่เสียแล้ว", () => {
  const r = validateRow({ ...GOOD, proNumber: "5.10001E+14" });
  assert.deepEqual(cols(r), ["proNumber"]);
  assert.match(r.errors[0].msg, /scientific|E\+/i);
  assert.deepEqual(validateRow({ ...GOOD, proNumber: "PRO-E+1" }).errors, []);
});

import { dupCard, sheetLine } from "../web/importer.js";
test("การ์ดแถวซ้ำ: ซ้ำแค่บางแถวก็ขึ้นการ์ด บอกว่ากี่แถวจากทั้งหมด และแถวไหน (พี่ปอนด์ 30/10 ภาพ #77 #78)", () => {
  assert.deepEqual(dupCard([7], 40), { title: "1 of 40 rows is already in the table", body: "Row 7. Importing will add it again." });
  assert.deepEqual(dupCard([2, 3], 5), { title: "2 of 5 rows are already in the table", body: "Rows 2, 3. Importing will add them again." });
  assert.equal(dupCard([2, 3, 4], 3).title, "Everything in this file is already in the table");
  assert.equal(dupCard([2], 1).body, "Did you upload this file before? Importing will add 1 row again.");
  assert.match(dupCard([...Array(14).keys()].map((i) => i + 2), 30).body, /^Rows 2, 3, 4, 5, 6, 7, 8, 9, 10, 11 and 4 more\./);
  assert.doesNotMatch(JSON.stringify(dupCard([7], 40)), /LOG BOOK DATE/);
});
test("บรรทัดชีต บอกจำนวนแถว ไม่ใช่ rows 2 to 2 (พี่ปอนด์ 30/10 ภาพ #80)", () => {
  assert.equal(sheetLine("LOG ELECTRIC", 1, "Worapakorn Pongudom"), "Sheet LOG ELECTRIC, 1 row to import. Imported rows will belong to Worapakorn Pongudom.");
  assert.equal(sheetLine("Sheet1", 40, "A"), "Sheet Sheet1, 40 rows to import. Imported rows will belong to A.");
});
