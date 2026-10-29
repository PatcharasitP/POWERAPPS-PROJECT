// port ครบทุกข้อจาก Data/ADVANCE/FnExtractSiteTests.pq (ในไฟล์มี 26 เคส ไม่ใช่ 24)
// expected ทุกค่าคัดจากไฟล์ .pq ต้นฉบับ ไม่ปรับ
import test from "node:test";
import assert from "node:assert/strict";
import { extractSite } from "../web/core/sitecode.js";

const j = (l) => l.join(", ");
const b = (t) => {
  const r = extractSite(t, "both");
  return `F=${j(r.full)} | NC=${j(r.noCandidate)}`;
};

const CASES = [
  // พฤติกรรม v4 เดิม ต้องไม่เปลี่ยน
  ["strip: BRR7401A -> BRR7401", () => j(extractSite("E.NE2/BRR7401A/01.12.24-31.12.24/53335-55794/5.13", true)), "BRR7401"],
  ["full: BRR7401A คงเดิม", () => j(extractSite("E.NE2/BRR7401A/01.12.24-31.12.24/53335-55794/5.13", false)), "BRR7401A"],
  ["default (ไม่ใส่ mode) = strip", () => j(extractSite("E.B1/NTB9167Z/01.10.25-31.10.25/7111-7765/5.6")), "NTB9167"],
  ["suffix TI 2 ตัว โดนตัด", () => j(extractSite("E.NR1/CMI9012TI/01.10.24-31.10.24/10Meter", true)), "CMI9012"],
  ["suffix TI 2 ตัว เก็บเมื่อ full", () => j(extractSite("E.NR1/CMI9012TI/01.10.24-31.10.24/10Meter", false)), "CMI9012TI"],
  ["v5.1 suffix DLM 3 ตัว โดนตัดเกลี้ยง", () => j(extractSite("E.B5/BM02005DLM/01.12.24-31.12.24/1Meter", true)), "BM02005"],
  ["v5.1 mode both: BMA0332DLM -> ฐาน BMA0332", () => b("E.B4/BMA0332DLM/01.01.26-31.01.26/2800-2876/6.3"), "F=BMA0332DLM | NC=BMA0332"],
  ["concat 3 โค้ดติดกัน", () => j(extractSite("PRI0015BKDC012PKN0014", true)), "PRI0015, BKDC012, PKN0014"],
  ["RM- prefix + concat: full ได้ 2 โค้ด", () => j(extractSite("RM-BKK4874ARM-BKK4874B", false)), "BKK4874A, BKK4874B"],
  ["RM- prefix + concat: strip เหลือโค้ดเดียว (dedup)", () => j(extractSite("RM-BKK4874ARM-BKK4874B", true)), "BKK4874"],
  ["RM-SKA0235/E -> base", () => j(extractSite("RM-SKA0235/E", true)), "SKA0235"],
  ["หลายโค้ดคั่น comma", () => j(extractSite("E.EAS/PCR7203A,PCR7204/01.12.25-31.12.25", false)), "PCR7203A, PCR7204"],
  ["RYG0136 เคสมาตรฐาน", () => j(extractSite("E.SMT/RYG0136/01.10.25-31.10.25/78605-82901/8", true)), "RYG0136"],
  ["junk ไม่มีโค้ด -> ว่าง", () => j(extractSite("16-30112024 CAPEX GPON", true)), ""],
  ["junk-guard ALL162 ยังกันอยู่ (base 6 หลัก)", () => j(extractSite("ALL 162 SITES RENTAL", true)), ""],
  ["null -> ว่าง", () => j(extractSite(null, true)), ""],
  ["suffix A + # คั่นวันที่", () => j(extractSite("DEP.B1-BKF80032A#2/12/24-1/12/27", false)), "BKF80032A"],
  ["SMT เก็บแบบมี suffix: UDT9003TI full", () => j(extractSite("E.NE1/UDT9003TI/01.12.24-31.12.24/7161.50-7260.50/8", false)), "UDT9003TI"],
  ["เลข 5 หลัก + suffix: STN80003A strip", () => j(extractSite("E.S2/STN80003A/01.11.24-31.11.24/1692-1723/23.5", true)), "STN80003"],
  // ของใหม่ v5
  ["v5 เลขแทรกกลาง: BM1A142DLM full", () => j(extractSite("E.B5/BM1A142DLM/01.01.25-31.01.25/1Meter", false)), "BM1A142DLM"],
  ["v5.1 เลขแทรกกลาง strip -> ฐาน", () => j(extractSite("E.B5/BM1A142DLM/01.01.25-31.01.25/1Meter", true)), "BM1A142"],
  ["v5 เลข 6 หลัก: BKF800103A full", () => j(extractSite("BKF800103A", false)), "BKF800103A"],
  ["v5 เลข 6 หลัก: BKF800103A strip", () => j(extractSite("BKF800103A", true)), "BKF800103"],
  ["v5 mode both: ได้ทั้งคู่ใน parse เดียว", () => b("E.NE2/BRR7401A/01.12.24-31.12.24/53335-55794/5.13"), "F=BRR7401A | NC=BRR7401"],
  ["v5 mode both: หลายโค้ด", () => b("E.EAS/PCR7203A,PCR7204/01.12.25-31.12.25"), "F=PCR7203A, PCR7204 | NC=PCR7203, PCR7204"],
  ["v5 mode both: ไม่มีโค้ด", () => b("16-30112024 CAPEX GPON"), "F= | NC="],
];

test("ตรวจว่าพอร์ตเคสครบเท่าไฟล์ต้นฉบับ (26 เคส)", () => {
  assert.equal(CASES.length, 26);
});

for (const [name, run, want] of CASES) {
  test(`fnExtractSite: ${name}`, () => assert.equal(run(), want));
}

test("รูปแบบผลลัพธ์: both คืนอ็อบเจ็กต์ full/noCandidate, โหมดอื่นคืนอาร์เรย์", () => {
  const r = extractSite("E.NE2/BRR7401A/01.12.24-31.12.24", "both");
  assert.deepEqual(Object.keys(r).sort(), ["full", "noCandidate"]);
  assert.ok(Array.isArray(extractSite("BRR7401A", true)));
  assert.ok(Array.isArray(extractSite("BRR7401A", false)));
  assert.ok(Array.isArray(extractSite("BRR7401A")));
  assert.deepEqual(extractSite("BRR7401A", undefined), ["BRR7401"]);
  assert.deepEqual(extractSite("brr7401a", "both"), { full: ["BRR7401A"], noCandidate: ["BRR7401"] }); // ตัวเล็กและช่องว่าง
});

test("ไม่แก้ผลข้ามการเรียก (ไม่มีสถานะค้าง)", () => {
  const t = "E.EAS/PCR7203A,PCR7204/01.12.25-31.12.25";
  assert.deepEqual(extractSite(t, "both"), extractSite(t, "both"));
});
